// Versão OAuth — copia o modelo (Google Sheets nativo) pra pasta de saída
// e preenche os dados nas células mapeadas.

const { google } = require('googleapis');
const { Readable } = require('stream');

// Pasta onde os relatórios finais são salvos (RELATORIOS ADS APP)
const OUTPUT_FOLDER_ID = '1df1RnmflydB0D7ToThnvh63KAhnYxObo';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { cliente, mes, ano, campaignsData, capaData } = req.body;

    // ── Validações ────────────────────────────────────────────
    if (!process.env.GOOGLE_REFRESH_TOKEN) {
      return res.status(500).json({
        success: false,
        error: 'GOOGLE_REFRESH_TOKEN não configurado.',
      });
    }

    const TEMPLATE_ID = process.env.GOOGLE_SHEETS_TEMPLATE_ID;
    if (!TEMPLATE_ID) {
      return res.status(500).json({
        success: false,
        error: 'GOOGLE_SHEETS_TEMPLATE_ID não configurado.',
      });
    }

    // ── Auth ──────────────────────────────────────────────────
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_OAUTH_CLIENT_ID,
      process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      process.env.GOOGLE_OAUTH_REDIRECT_URI
    );
    oauth2Client.setCredentials({
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    });

    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

    const novoNome = ['Relatório', cliente, mes, ano].filter(Boolean).join(' - ');
    const titulo = [cliente, mes, ano].filter(Boolean).join(' - ').toUpperCase();
    const fb = (capaData && capaData.fb) || {};
    const ig = (capaData && capaData.ig) || {};

    // ── 1. Copiar o template pra pasta de saída ───────────────
    const templateMeta = await drive.files.get({
      fileId: TEMPLATE_ID,
      fields: 'mimeType, name',
    });

    let spreadsheetId;

    if (templateMeta.data.mimeType === 'application/vnd.google-apps.spreadsheet') {
      // Google Sheets nativo — copia direto (preserva toda formatação)
      const copied = await drive.files.copy({
        fileId: TEMPLATE_ID,
        requestBody: {
          name: novoNome,
          parents: [OUTPUT_FOLDER_ID],
        },
        fields: 'id',
      });
      spreadsheetId = copied.data.id;
    } else {
      // Fallback pra .xlsx — baixa e reenvia convertendo
      const xlsxBuffer = await drive.files.get(
        { fileId: TEMPLATE_ID, alt: 'media' },
        { responseType: 'arraybuffer' }
      );

      const buf = Buffer.from(xlsxBuffer.data);
      const stream = Readable.from(buf);

      const uploaded = await drive.files.create({
        requestBody: {
          name: novoNome,
          mimeType: 'application/vnd.google-apps.spreadsheet',
          parents: [OUTPUT_FOLDER_ID],
        },
        media: {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          body: stream,
        },
        fields: 'id',
      });
      spreadsheetId = uploaded.data.id;
    }

    // ── 2. Preencher a Capa nas células mapeadas ──────────────
    const pct = v => {
      const s = String(v || '').trim();
      if (!s) return '';
      return s.endsWith('%') ? s : s + '%';
    };

    const capaUpdates = [
      // CABEÇALHO
      { range: 'Capa!C2', values: [[titulo]] },

      // FACEBOOK
      { range: 'Capa!E12', values: [[fb.seguidores || '']] },
      { range: 'Capa!C15', values: [[fb.segAnterior ? `${fb.segAnterior} seguidores no mês anterior` : '']] },
      { range: 'Capa!E18', values: [[fb.homens ? `👨 ${pct(fb.homens)} Homens` : '']] },
      { range: 'Capa!E23', values: [[fb.mulheres ? `👩 ${pct(fb.mulheres)} Mulheres` : '']] },
      { range: 'Capa!B33', values: [[fb.faixa || '']] },
      { range: 'Capa!D33', values: [[fb.alcancadas || '']] },
      { range: 'Capa!G33', values: [[fb.visitas || '']] },

      // INSTAGRAM
      { range: 'Capa!N12', values: [[ig.seguidores || '']] },
      { range: 'Capa!L15', values: [[ig.segAnterior ? `${ig.segAnterior} seguidores no mês anterior` : '']] },
      { range: 'Capa!N18', values: [[ig.homens ? `👨 ${pct(ig.homens)} Homens` : '']] },
      { range: 'Capa!N23', values: [[ig.mulheres ? `👩 ${pct(ig.mulheres)} Mulheres` : '']] },
      { range: 'Capa!K33', values: [[ig.faixa || '']] },
      { range: 'Capa!M33', values: [[ig.alcancadas || '']] },
      { range: 'Capa!P33', values: [[ig.visitas || '']] },
    ];

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: capaUpdates,
      },
    });

    // ── 3. Preencher a aba Relatório (cabeçalho + dados) ──────
    const cabecalho = [
      'Nome da Ação', 'Formato', 'Validade', 'Investimento', 'Valor Gasto',
      'Alcance', 'Engajamento', 'Cliques no Link', 'Visualização (ThruPlay)',
      'Custo por 1.000 Pessoas', 'Custo por Cliques no Link', 'Custo por ThruPlay',
      'Custo por Interação', 'Custo por Conversa', 'Filtro', 'Cidade', 'Conversas Iniciadas'
    ];

    const fmt = v => (typeof v === 'number' && v > 0) ? v : '';

    const linhas = (campaignsData || []).map(r => {
      const o = r.objective;
      const isEF = /panfleto|carrossel|virtual|tabloide|post/i.test(r.format || '');
      return [
        r.name, r.format, r.validity || '',
        fmt(r.budget), fmt(r.spent),
        (o === 'Alcance' || o === 'Reels') ? fmt(r.reach) : '',
        (o === 'Engajamento' && isEF) ? fmt(r.eng) : '',
        (o === 'EngLink' || o === 'ConvLink') ? fmt(r.links) : '',
        o === 'Reels' ? fmt(r.views) : '',
        o === 'Alcance' ? fmt(r.cpm) : '',
        (o === 'EngLink' || o === 'ConvLink') ? fmt(r.cpc) : '',
        o === 'Reels' ? fmt(r.cThru) : '',
        (o === 'Engajamento' && isEF) ? fmt(r.cInt) : '',
        o === 'Conversas' ? fmt(r.cConv) : '',
        '', '',
        o === 'Conversas' ? fmt(r.conv) : '',
      ];
    });

    const valoresRelatorio = [cabecalho, ...linhas];

    // Limpa a aba Relatório antes (caso o modelo tenha dados antigos)
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: 'Relatório!A1:Q1000',
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Relatório!A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: valoresRelatorio },
    });

    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
    return res.status(200).json({ success: true, url, spreadsheetId });

  } catch (err) {
    console.error('Erro export Google Sheets:', JSON.stringify({
      message: err.message,
      code: err.code,
      status: err.status,
      errors: err.errors,
    }));
    return res.status(500).json({ success: false, error: err.message });
  }
};
