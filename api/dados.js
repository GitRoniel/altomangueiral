// api/dados.js — Vercel Serverless Function
// Busca a planilha do Google Sheets, processa os dados e retorna JSON
// no mesmo formato que o HTML espera (ALL_DATA + DESC_MAP).

const SHEET_ID = '1pdL0URkamBsdlyNoaVND0PXcljntHNrDXRwoDuLaH1g';

export default async function handler(req, res) {
  // Cache: 5 minutos no CDN do Vercel, atualiza em background
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
  res.setHeader('Content-Type', 'application/json');

  const csvUrl =
    `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv`;

  try {
    const response = await fetch(csvUrl);
    if (!response.ok) throw new Error(`Google Sheets retornou HTTP ${response.status}`);

    const csvText = await response.text();
    const rows = parseCSV(csvText);

    if (rows.length < 2) {
      return res.status(200).json({ allData: [], descMap: {} });
    }

    const headers = rows[0];
    const dataRows = rows.slice(1).filter(r => r.some(c => c.trim() !== ''));

    // Mapa de colunas pelo nome do cabeçalho
    const ci = {};
    headers.forEach((h, i) => { ci[h.trim()] = i; });

    // Verifica colunas obrigatórias
    const required = ['obra', 'pedido', 'quem', 'codInsumo', 'insumo',
      'qtdeEntregue', 'qtdeDescartada', 'qtdeRestante', 'unidade',
      'dtPedido', 'Registros ordemcompra', 'fornecedor',
      'dataEntrega', 'dtPrevistaEntrega', 'Auxiliar', 'Descrição Pedido'];
    const missing = required.filter(c => ci[c] === undefined);
    if (missing.length > 0) {
      return res.status(500).json({ error: `Colunas não encontradas: ${missing.join(', ')}` });
    }

    // ── Agrupa linhas por (obra, pedido) ──────────────────────────────────────
    const groups = new Map();
    for (const row of dataRows) {
      const obra   = (row[ci['obra']]   || '').trim();
      const pedido = (row[ci['pedido']] || '').trim();
      if (!obra || !pedido || isNaN(parseInt(pedido))) continue;
      const key = `${obra}-${pedido}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }

    const allData = [];
    const descMap = {};

    for (const [, pRows] of groups) {
      const first = pRows[0];
      const obra     = first[ci['obra']].trim();
      const pedido   = parseInt(first[ci['pedido']]);
      const solicitante = first[ci['quem']].trim();
      const dtPedidoRaw = first[ci['dtPedido']].trim();
      const dtPedido    = parseDate(dtPedidoRaw);
      const ano = dtPedido ? parseInt(dtPedido.slice(0, 4)) : null;

      // OC únicas (não vazias) para o pedido
      const ocSet = new Set();
      pRows.forEach(r => {
        const oc = (r[ci['Registros ordemcompra']] || '').trim();
        if (oc) ocSet.add(oc);
      });
      const ocStr    = [...ocSet].join(', ');
      const ocStatus = ocSet.size > 0 ? 'OC GERADA' : 'PENDENTE DE OC';

      // Linhas com OC confirmada
      const ocRows = pRows.filter(r => (r[ci['Registros ordemcompra']] || '').trim() !== '');

      // Data de entrega mais recente
      let dtEntrega = null;
      pRows.forEach(r => {
        const d = parseDate((r[ci['dataEntrega']] || '').trim());
        if (d && (!dtEntrega || d > dtEntrega)) dtEntrega = d;
      });

      // Data prevista (preferir linhas com OC)
      let dtPrev = null;
      for (const r of [...ocRows, ...pRows]) {
        const d = parseDate((r[ci['dtPrevistaEntrega']] || '').trim());
        if (d) { dtPrev = d; break; }
      }

      // Fornecedor (primeiro não vazio das linhas com OC)
      let fornecedor = '';
      for (const r of [...ocRows, ...pRows]) {
        const f = (r[ci['fornecedor']] || '').trim();
        if (f && f !== '—' && f !== '********') { fornecedor = f; break; }
      }

      // DESC_MAP: chave "obra-pedido" → descrição
      const descRaw = (first[ci['Descrição Pedido']] || '').trim();
      if (descRaw) descMap[`${obra}-${pedido}`] = descRaw;

      // ── Agrupa materiais por codInsumo ──────────────────────────────────────
      const matGroups = new Map();
      pRows.forEach(r => {
        const cod = (r[ci['codInsumo']] || '').trim();
        if (!cod) return;
        if (!matGroups.has(cod)) matGroups.set(cod, []);
        matGroups.get(cod).push(r);
      });

      const materiais = [];

      for (const [, mRows] of matGroups) {
        // Se existem linhas com OC, usa apenas elas (evita duplicatas sem OC)
        const withOC = mRows.filter(r => (r[ci['Registros ordemcompra']] || '').trim() !== '');
        const use    = withOC.length > 0 ? withOC : mRows;

        const nome    = (use[0][ci['insumo']]   || '').trim().replace(/\s+/g, ' ');
        const unidade = (use[0][ci['unidade']]   || '').trim();

        // Soma quantidades
        let totalEnt = 0, totalDesc = 0, totalRest = 0;
        const matOCs = new Set();
        use.forEach(r => {
          totalEnt  += parseBR(r[ci['qtdeEntregue']]);
          totalDesc += parseBR(r[ci['qtdeDescartada']]);
          totalRest += parseBR(r[ci['qtdeRestante']]);
          const oc = (r[ci['Registros ordemcompra']] || '').trim();
          if (oc) matOCs.add(oc);
        });

        // sol = entregue + restante (descartada não conta na meta)
        const sol = totalEnt + totalRest;
        const ent = totalEnt;
        const pct = sol > 0
          ? Math.round((ent / sol) * 100)
          : (totalDesc > 0 ? 100 : 0); // tudo descartado = encerrado

        materiais.push({
          nome,
          pct,
          sol: fmtQty(sol, unidade),
          ent: fmtQty(ent, unidade),
          oc : [...matOCs].join(', '),
        });
      }

      // ── Pct geral do pedido ─────────────────────────────────────────────────
      let totalPedEnt = 0, totalPedSol = 0;
      materiais.forEach(m => {
        totalPedSol += parseFloat(m.sol) || 0;
        totalPedEnt += parseFloat(m.ent) || 0;
      });
      const pct = totalPedSol > 0
        ? Math.round((totalPedEnt / totalPedSol) * 100)
        : 0;

      let deliveryStatus;
      if (pct === 100)                                        deliveryStatus = 'ENTREGUE TOTALMENTE';
      else if (pct > 0 || materiais.some(m => parseFloat(m.ent) > 0)) deliveryStatus = 'ENTREGUE PARCIALMENTE';
      else                                                    deliveryStatus = 'PENDENTE DE ENTREGA';

      allData.push({
        obra,
        pedido,
        solicitante,
        ano,
        dt_pedido     : dtPedido,
        dt_prev       : dtPrev,
        dt_entrega    : dtEntrega,
        n_itens       : materiais.length,
        oc            : ocStr,
        oc_status     : ocStatus,
        delivery_status: deliveryStatus,
        pct,
        materiais,
        fornecedor,
      });
    }

    // Ordena: obra crescente, pedido crescente
    allData.sort((a, b) => a.obra.localeCompare(b.obra) || a.pedido - b.pedido);

    return res.status(200).json({ allData, descMap });

  } catch (err) {
    console.error('[dados.js]', err);
    return res.status(500).json({ error: err.message });
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Converte "M/D/YYYY" → "YYYY-MM-DD". Retorna null se inválido. */
function parseDate(s) {
  if (!s) return null;
  const p = s.split('/');
  if (p.length !== 3) return null;
  const [m, d, y] = p;
  if (!m || !d || !y || y.length < 4) return null;
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

/** Parse número que pode usar vírgula como decimal (padrão BR). */
function parseBR(s) {
  return parseFloat((s || '0').replace(',', '.')) || 0;
}

/** Formata quantidade + unidade sem zeros desnecessários. Ex: "90 M", "2.7 M2" */
function fmtQty(n, unit) {
  const s = Number.isInteger(n)
    ? String(n)
    : parseFloat(n.toFixed(4)).toString();
  return unit ? `${s} ${unit}` : s;
}

/** Parser CSV robusto: suporta campos com aspas e vírgulas internas. */
function parseCSV(text) {
  const rows = [];
  let row   = [];
  let field = '';
  let inQ   = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') { inQ = false; }
      else { field += ch; }
    } else {
      if      (ch === '"')  { inQ = true; }
      else if (ch === ',')  { row.push(field); field = ''; }
      else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (ch !== '\r') { field += ch; }
    }
  }
  // última linha sem \n
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}
