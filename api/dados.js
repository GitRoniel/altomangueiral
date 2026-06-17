// api/dados.js — Vercel Serverless Function
// Busca a planilha do Google Sheets (aba principal + aba Insumos),
// processa os dados e retorna JSON (ALL_DATA + DESC_MAP).
// A descrição do pedido é deduzida pela "Categoria do Item" (aba Insumos),
// usando a "Descrição Pedido" manual como override quando preenchida.

const SHEET_ID = '1pdL0URkamBsdlyNoaVND0PXcljntHNrDXRwoDuLaH1g';

// Categoria crua (aba Insumos, coluna "Desc. Categoria") -> rótulo amigável.
// Extraído do relatório original (V16) para manter a mesma aparência.
const CAT_PRETTY = {
"MATERIAL - ESCRITORIO":"Material de Escritório",
"MAO DE OBRA":"Mão de Obra",
"INSTALACOES ELETRICAS": "Instalações Elétricas",
"ACO": "Aço",
"EPI / EPC": "EPI / EPC",
"ADITIVOS / COLAS / SIMILARES": "Aditivos / Colas / Similares",
"CONSERVACAO / LIMPEZA": "Conservação / Limpeza",
"FERRAMENTAS": "Ferramentas",
"MATERIAL - APLICADO NA OBRA": "Material Aplicado na Obra",
"LUMINARIAS": "Luminárias",
"MOVEIS / UTENSILIOS": "Móveis / Utensílios",
"MAQUINAS / EQUIPAMENTOS": "Máquinas / Equipamentos",
"AGREGADOS": "Agregados",
"ENSACADOS": "Ensacados",
"SERVICOS - TECNICOS": "Serviços Tecnicos",
"LOUCAS / METAIS / ACESSORIOS": "Louças / Metais / Acessórios",
"MARMORES / GRANITOS / RESINAS": "Mármores / Granitos / Resinas",
"PINTURAS": "Pinturas",
"FIXADORES / FERRAGENS": "Fixadores / Ferragens",
"CABOS ELETRICOS": "Cabos Elétricos",
"ESTRUTURAS DE CONCRETO": "Estruturas de Concreto",
"MADEIRAS": "Madeiras",
"INCENDIO": "Incêndio",
"DRYWALL / GESSO": "Drywall / Gesso",
"CONCRETOS": "Concretos",
"TELHADOS": "Telhados",
"ACABAMENTO ELETRICO": "Acabamento Elétrico",
"PLOTAGEM / GRAFICA": "Plotagem / Gráfica",
"COMBUSTIVEIS / LUBRIFICANTES / OLEOS": "Combustiveis / Lubrificantes / Oleos",
"PAISAGISMO": "Paisagismo",
"PRE-MOLDADOS": "Pré-moldados",
"BLOCOS ESTRUTURAIS E DE VEDAÇÃO": "Blocos Estruturais e de Vedação",
"PARAFUSOS / ARRUELAS / PORCAS": "Parafusos / Arruelas / Porcas",
"REVESTIMENTOS - PISOS / CERAMICA / PORCELANATO": "Revestimentos - Pisos / Ceramica / Porcelanato",
"REVESTIMENTOS - PAREDE / CERAMICA / PORCELANATO": "Revestimentos - Parede / Ceramica / Porcelanato",
"PLACAS / SINALIZACOES": "Placas / Sinalizações",
"UNIFORMES": "Uniformes",
"COPA / COZINHA": "Copa / Cozinha",
"MARKETING": "Marketing",
"ESTRUTURAS METALICAS": "Estruturas Metálicas",
"SERVICOS DE TERCEIROS": "Serviços de Terceiros",
"INSTALAÇÕES ELETRICAS": "Instalações Elétricas",
"MAQUINAS E  EQUIPAMENTOS": "Maquinas e Equipamentos",
"DESPESAS - MANUTENCOES": "Despesas - Manutencoes",
"COMBUSTIVEIS E LUBRIFICANTES - OBRA": "Combustiveis e Lubrificantes - Obra",
"MATERIAL DE LIMPEZA": "Material de Limpeza",
"SERVIÇOS TECNICOS": "Serviços Tecnicos",
"EQUIPAMENTOS COMUNITARIOS": "Equipamentos Comunitarios",
"MATERIAL APLICADO NA OBRA": "Material Aplicado na Obra",
"MATERIAL DE ESCRITORIO": "Material de Escritório",
"MANUTENCAO - CONSERVACAO DE VEICULOS": "Manutencao - Conservacao de Veiculos",
"INSTALACOES ESPECIAIS": "Instalações Especiais",
"IMPERMEABILIZAÇÕES E TRATAMENTOS": "Impermeabilizações e Tratamentos",
"INDIRETOS": "Indiretos",
"EQUIPAMENTOS COMUNITÁRIOS": "Equipamentos Comunitarios",
"REVESTIMENTOS": "Revestimentos"
};

// Dicionário de acentos para categorias não mapeadas acima.
const PT_LOWER = new Set(['de','da','do','das','dos','e','para','com','a','o','em','no','na']);
const PT_ACC = {
  'servicos':'Serviços','instalacoes':'Instalações','hidrosanitarias':'Hidrossanitárias',
  'hidrossanitarias':'Hidrossanitárias','eletricas':'Elétricas','eletrica':'Elétrica',
  'despesas':'Despesas','escritorio':'Escritório','maquinas':'Máquinas','equipamentos':'Equipamentos',
  'locacao':'Locação','esquadrias':'Esquadrias','aluminio':'Alumínio','metalica':'Metálica',
  'impermeabilizacoes':'Impermeabilizações','acustico':'Acústico','termico':'Térmico',
  'madeiras':'Madeiras','mao':'Mão','horta':'Horta','implantacao':'Implantação','manutencao':'Manutenção',
  'plantio':'Plantio','agua':'Água','gas':'Gás','exaustao':'Exaustão','paisagismo':'Paisagismo',
  'salarios':'Salários','medico':'Médico','tributarias':'Tributárias','tributaria':'Tributária',
  'juridicas':'Jurídicas','contabeis':'Contábeis','honorarios':'Honorários','incorporacao':'Incorporação',
  'legalizacao':'Legalização','revestimentos':'Revestimentos','cimenticios':'Cimentícios',
  'granilite':'Granilite','vinilicos':'Vinílicos','marmore':'Mármore','marmores':'Mármores',
  'granito':'Granito','granitos':'Granitos','pedras':'Pedras','rodapes':'Rodapés','peitoris':'Peitoris',
  'soleiras':'Soleiras','vedacoes':'Vedações','informatica':'Informática','perifericos':'Periféricos',
  'cartorios':'Cartórios','registros':'Registros','licencas':'Licenças','anuidades':'Anuidades',
  'conselhos':'Conselhos','confraternizacoes':'Confraternizações','eventos':'Eventos',
  'consultoria':'Consultoria','engenharia':'Engenharia','arquitetura':'Arquitetura','projetos':'Projetos',
  'sinalizacoes':'Sinalizações','placas':'Placas','seguros':'Seguros','alimentacao':'Alimentação',
  'auxilio':'Auxílio','impostos':'Impostos','taxas':'Taxas','administrativas':'Administrativas',
  'administrativa':'Administrativa','processuais':'Processuais','custas':'Custas','advocaticios':'Advocatícios',
  'indiretos':'Indiretos','comercial':'Comercial','marketing':'Marketing','uniformes':'Uniformes',
  'telhados':'Telhados','concretos':'Concretos','concreto':'Concreto','estruturas':'Estruturas',
  'pavimentacao':'Pavimentação','drenagem':'Drenagem','esgoto':'Esgoto','hidraulica':'Hidráulica',
  'rede':'Rede','aplicado':'Aplicado','obra':'Obra','material':'Material','terceiros':'Terceiros',
  'gerais':'Gerais','financeiras':'Financeiras','laminados':'Laminados','borracha':'Borracha',
  'especiais':'Especiais','copa':'Copa','cozinha':'Cozinha','utensilios':'Utensílios','moveis':'Móveis',
  'loucas':'Louças','metais':'Metais','acessorios':'Acessórios','fixadores':'Fixadores','ferragens':'Ferragens',
  'parafusos':'Parafusos','arruelas':'Arruelas','porcas':'Porcas','aco':'Aço','cabos':'Cabos',
  'acabamento':'Acabamento','luminarias':'Luminárias','incendio':'Incêndio','pinturas':'Pinturas',
  'aditivos':'Aditivos','colas':'Colas','similares':'Similares','agregados':'Agregados','ensacados':'Ensacados',
  'equipe':'Equipe','novos':'Novos','investimentos':'Investimentos','tratamentos':'Tratamentos',
  'alvenarias':'Alvenarias','fechamentos':'Fechamentos','elevadores':'Elevadores','ar':'Ar',
  'condicionado':'Condicionado','computadores':'Computadores','softwares':'Softwares','plotagem':'Plotagem',
  'grafica':'Gráfica','ordenados':'Ordenados','admnistrativa':'Administrativa'
};

function stripAcc(s){ return (s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,''); }

function prettyCat(raw){
  if(!raw) return '';
  if(CAT_PRETTY[raw]) return CAT_PRETTY[raw];
  const words = raw.replace(/\s*\/\s*/g,' / ').replace(/\s+-\s+/g,' - ').split(/\s+/);
  return words.map((w,i)=>{
    if(w==='/'||w==='-') return w;
    const lw = stripAcc(w.toLowerCase());
    if(PT_ACC[lw]) return PT_ACC[lw];
    if(i>0 && PT_LOWER.has(lw)) return lw;
    if(/^[0-9]+$/.test(w)) return w;
    return w.charAt(0).toUpperCase()+w.slice(1).toLowerCase();
  }).join(' ');
}

// Categoria inválida/sem sentido p/ descrição (códigos numéricos, vazios, etc.)
function catValida(c){
  if(!c) return false;
  const t=c.trim();
  if(!t) return false;
  if(/^[0-9]+$/.test(t)) return false;        // ex.: "282", "313"
  if(/^0\s*-/.test(t)) return false;          // ex.: "0 - Não"
  return true;
}

function truncName(n){
  n=(n||'').trim();
  return n.length>26 ? n.slice(0,26).replace(/\s+$/,'')+'…' : n;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
  res.setHeader('Content-Type', 'application/json');

  const base = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv`;
  const csvUrlMain    = base;
  const csvUrlInsumos = base + '&sheet=Insumos';

  try {
    // Busca as duas abas em paralelo
    const [respMain, respIns] = await Promise.all([
      fetch(csvUrlMain),
      fetch(csvUrlInsumos).catch(() => null),
    ]);
    if (!respMain.ok) throw new Error(`Google Sheets retornou HTTP ${respMain.status}`);

    const csvText = await respMain.text();
    const rows = parseCSV(csvText);
    if (rows.length < 2) return res.status(200).json({ allData: [], descMap: {} });

    // ── Mapa codInsumo -> categoria amigável (aba Insumos) ──────────────────
    const catByCod = {};
    if (respIns && respIns.ok) {
      try {
        const insRows = parseCSV(await respIns.text());
        if (insRows.length > 1) {
          const ih = {};
          insRows[0].forEach((h, i) => { ih[h.trim()] = i; });
          const cCod = ih['Código'];
          const cCat = ih['Desc. Categoria'];
          if (cCod !== undefined && cCat !== undefined) {
            for (const r of insRows.slice(1)) {
              const cod = (r[cCod] || '').trim();
              const cat = (r[cCat] || '').trim();
              if (cod && catValida(cat) && !catByCod[cod]) {
                catByCod[cod] = prettyCat(cat);
              }
            }
          }
        }
      } catch (e) { /* se a aba Insumos falhar, segue sem dedução */ }
    }

    const headers = rows[0];
    const dataRows = rows.slice(1).filter(r => r.some(c => c.trim() !== ''));

    const ci = {};
    headers.forEach((h, i) => { ci[h.trim()] = i; });

    const required = ['obra', 'pedido', 'quem', 'codInsumo', 'insumo',
      'qtdeEntregue', 'qtdeDescartada', 'qtdeRestante', 'unidade',
      'dtPedido', 'Registros ordemcompra', 'fornecedor',
      'dataEntrega', 'dtPrevistaEntrega', 'Auxiliar', 'Descrição Pedido'];
    const missing = required.filter(c => ci[c] === undefined);
    if (missing.length > 0) {
      return res.status(500).json({ error: `Colunas não encontradas: ${missing.join(', ')}` });
    }

    // ── Agrupa linhas por (obra, pedido) ────────────────────────────────────
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

      const ocSet = new Set();
      pRows.forEach(r => {
        const oc = (r[ci['Registros ordemcompra']] || '').trim();
        if (oc) ocSet.add(oc);
      });
      const ocStr    = [...ocSet].join(', ');
      const ocStatus = ocSet.size > 0 ? 'OC GERADA' : 'PENDENTE DE OC';

      const ocRows = pRows.filter(r => (r[ci['Registros ordemcompra']] || '').trim() !== '');

      let dtEntrega = null;
      pRows.forEach(r => {
        const d = parseDate((r[ci['dataEntrega']] || '').trim());
        if (d && (!dtEntrega || d > dtEntrega)) dtEntrega = d;
      });

      let dtPrev = null;
      for (const r of [...ocRows, ...pRows]) {
        const d = parseDate((r[ci['dtPrevistaEntrega']] || '').trim());
        if (d) { dtPrev = d; break; }
      }

      let fornecedor = '';
      for (const r of [...ocRows, ...pRows]) {
        const f = (r[ci['fornecedor']] || '').trim();
        if (f && f !== '—' && f !== '********') { fornecedor = f; break; }
      }

      // ── Agrupa materiais por codInsumo ──────────────────────────────────────
      const matGroups = new Map();
      pRows.forEach(r => {
        const cod = (r[ci['codInsumo']] || '').trim();
        if (!cod) return;
        if (!matGroups.has(cod)) matGroups.set(cod, []);
        matGroups.get(cod).push(r);
      });

      const materiais = [];
      const catCount  = new Map();   // categoria -> contagem (p/ categoria dominante)
      const nomesOrd  = [];          // nomes na ordem de aparição (p/ descrição)

      for (const [cod, mRows] of matGroups) {
        const withOC = mRows.filter(r => (r[ci['Registros ordemcompra']] || '').trim() !== '');
        const use    = withOC.length > 0 ? withOC : mRows;

        const nome    = (use[0][ci['insumo']]   || '').trim().replace(/\s+/g, ' ');
        const unidade = (use[0][ci['unidade']]   || '').trim();

        let totalEnt = 0, totalDesc = 0, totalRest = 0;
        const matOCs = new Set();
        use.forEach(r => {
          totalEnt  += parseBR(r[ci['qtdeEntregue']]);
          totalDesc += parseBR(r[ci['qtdeDescartada']]);
          totalRest += parseBR(r[ci['qtdeRestante']]);
          const oc = (r[ci['Registros ordemcompra']] || '').trim();
          if (oc) matOCs.add(oc);
        });

        const sol = totalEnt + totalRest;
        const ent = totalEnt;
        const pct = sol > 0
          ? Math.round((ent / sol) * 100)
          : (totalDesc > 0 ? 100 : 0);

        materiais.push({
          nome, pct,
          sol: fmtQty(sol, unidade),
          ent: fmtQty(ent, unidade),
          oc : [...matOCs].join(', '),
        });

        if (nome) nomesOrd.push(nome);
        const cat = catByCod[cod];
        if (cat) catCount.set(cat, (catCount.get(cat) || 0) + 1);
      }

      // ── Descrição do pedido ─────────────────────────────────────────────────
      const descManual = (first[ci['Descrição Pedido']] || '').trim();
      let desc = '';
      if (descManual) {
        desc = descManual;                               // override manual
      } else {
        // categoria dominante (primeira em caso de empate)
        let catDom = '', best = 0;
        for (const [c, n] of catCount) { if (n > best) { best = n; catDom = c; } }
        const nomes = nomesOrd.slice(0, 3).map(truncName).join(', ');
        if (catDom && nomes) desc = `${catDom} (${nomes})`;
        else if (nomes)      desc = nomes;
        else if (catDom)     desc = catDom;
      }
      if (desc) descMap[`${obra}-${pedido}`] = desc;

      let totalPedEnt = 0, totalPedSol = 0;
      materiais.forEach(m => {
        totalPedSol += parseFloat(m.sol) || 0;
        totalPedEnt += parseFloat(m.ent) || 0;
      });
      const pct = totalPedSol > 0 ? Math.round((totalPedEnt / totalPedSol) * 100) : 0;

      let deliveryStatus;
      if (pct === 100)                                               deliveryStatus = 'ENTREGUE TOTALMENTE';
      else if (pct > 0 || materiais.some(m => parseFloat(m.ent) > 0)) deliveryStatus = 'ENTREGUE PARCIALMENTE';
      else                                                          deliveryStatus = 'PENDENTE DE ENTREGA';

      allData.push({
        obra, pedido, solicitante, ano,
        dt_pedido: dtPedido, dt_prev: dtPrev, dt_entrega: dtEntrega,
        n_itens: materiais.length,
        oc: ocStr, oc_status: ocStatus,
        delivery_status: deliveryStatus,
        pct, materiais, fornecedor,
      });
    }

    allData.sort((a, b) => a.obra.localeCompare(b.obra) || a.pedido - b.pedido);
    return res.status(200).json({ allData, descMap });

  } catch (err) {
    console.error('[dados.js]', err);
    return res.status(500).json({ error: err.message });
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function parseDate(s) {
  if (!s) return null;
  const p = s.split('/');
  if (p.length !== 3) return null;
  const [m, d, y] = p;
  if (!m || !d || !y || y.length < 4) return null;
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}
function parseBR(s) { return parseFloat((s || '0').replace(',', '.')) || 0; }
function fmtQty(n, unit) {
  const s = Number.isInteger(n) ? String(n) : parseFloat(n.toFixed(4)).toString();
  return unit ? `${s} ${unit}` : s;
}
function parseCSV(text) {
  const rows = []; let row = []; let field = ''; let inQ = false;
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
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}
