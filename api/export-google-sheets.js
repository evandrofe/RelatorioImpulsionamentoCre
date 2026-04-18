// Versão OAuth — copia o modelo, preserva a formatação do título, cabeçalho e legendas.
// Os dados das campanhas são inseridos a partir da linha 3 (linhas 1-2 já existem no modelo).
// As legendas do "RAIO-X" são empurradas pra baixo conforme a quantidade de dados.

const { google } = require('googleapis');
const { Readable } = require('stream');

const OUTPUT_FOLDER_ID = '1df1RnmflydB0D7ToThnvh63KAhnYxObo';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { cliente, mes, ano, campaignsData, capaData } = req.body;

    if (!process.env.GOOGLE_REFRESH_TOKEN) {
      return res.status(500).json({ success: false, error: 'GOOGLE_REFRESH_TOKEN não configurado.' });
    }

    const TEMPLATE_ID = process.env.GOOGLE_SHEETS_TEMPLATE_ID;
    if (!TEMPLATE_ID) {
      return res.status(500).json({ success: false, error: 'GOOGLE_SHEETS_TEMPLATE_ID não configurado.' });
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

    // ── 1. Copiar o template ──────────────────────────────────
    const templateMeta = await drive.files.get({
      fileId: TEMPLATE_ID,
      fields: 'mimeType',
    });

    let spreadsheetId;

    if (templateMeta.data.mimeType === 'application/vnd.google-apps.spreadsheet') {
      const copied = await drive.files.copy({
        fileId: TEMPLATE_ID,
        requestBody: { name: novoNome, parents: [OUTPUT_FOLDER_ID] },
        fields: 'id',
      });
      spreadsheetId = copied.data.id;
    } else {
      const xlsxBuffer = await drive.files.get(
        { fileId: TEMPLATE_ID, alt: 'media' },
        { responseType: 'arraybuffer' }
      );
      const uploaded = await drive.files.create({
        requestBody: {
          name: novoNome,
          mimeType: 'application/vnd.google-apps.spreadsheet',
          parents: [OUTPUT_FOLDER_ID],
        },
        media: {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          body: Readable.from(Buffer.from(xlsxBuffer.data)),
        },
        fields: 'id',
      });
      spreadsheetId = uploaded.data.id;
    }

    // ── 2. Preencher a Capa ───────────────────────────────────
    const pct = v => {
      const s = String(v || '').trim();
      if (!s) return '';
      return s.endsWith('%') ? s : s + '%';
    };

    const capaUpdates = [
      { range: 'Capa!C2', values: [[titulo]] },
      { range: 'Capa!E12', values: [[fb.seguidores || '']] },
      { range: 'Capa!C15', values: [[fb.segAnterior ? `${fb.segAnterior} seguidores no mês anterior` : '']] },
      { range: 'Capa!E18', values: [[fb.homens ? `👨 ${pct(fb.homens)} Homens` : '']] },
      { range: 'Capa!E23', values: [[fb.mulheres ? `👩 ${pct(fb.mulheres)} Mulheres` : '']] },
      { range: 'Capa!B33', values: [[fb.faixa || '']] },
      { range: 'Capa!D33', values: [[fb.alcancadas || '']] },
      { range: 'Capa!G33', values: [[fb.visitas || '']] },
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
      requestBody: { valueInputOption: 'USER_ENTERED', data: capaUpdates },
    });

    // ── 3. Descobrir a estrutura da aba Relatório ─────────────
    // Ler toda a aba pra encontrar onde ficam as legendas
    const existingData = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Relatório!A1:Q100',
      valueRenderOption: 'FORMATTED_VALUE',
    });
    const existingRows = existingData.data.values || [];

    // Encontra a linha do "RAIO-X" (0-indexed)
    let raioXRowIdx = -1;
    for (let i = 0; i < existingRows.length; i++) {
      const firstCell = String(existingRows[i][0] || '').trim();
      if (firstCell.includes('RAIO-X')) {
        raioXRowIdx = i;
        break;
      }
    }

    // Pega a aba "Relatório" pra saber o sheetId
    const spreadsheetMeta = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets(properties(sheetId,title))',
    });
    const relatorioSheet = spreadsheetMeta.data.sheets.find(
      s => s.properties.title === 'Relatório'
    );
    const sheetId = relatorioSheet ? relatorioSheet.properties.sheetId : 0;

    // ── 4. Montar os dados das campanhas ──────────────────────
    const fmt = v => (typeof v === 'number' && v > 0) ? v : '';
    const fmtBRL = v => {
      if (typeof v !== 'number' || v <= 0) return '';
      return 'R$ ' + v.toFixed(2).replace('.', ',');
    };
    const fmtNum = v => {
      if (typeof v !== 'number' || v <= 0) return '';
      return v.toLocaleString('pt-BR');
    };

    // Agrupa campanhas por data pra inserir linhas separadoras
    const dataRows = [];
    let lastDateKey = null;

    (campaignsData || []).forEach((r, idx) => {
      const o = r.objective;
      const isEF = /panfleto|carrossel|virtual|tabloide|post/i.test(r.format || '');

      // Extrai data do nome pra agrupar
      const dateMatch = (r.name || '').match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/);
      let curDateKey = 'none';
      if (dateMatch) {
        let year = +dateMatch[3];
        if (year < 100) year += 2000;
        curDateKey = `${year}-${dateMatch[2].padStart(2,'0')}-${dateMatch[1].padStart(2,'0')}`;
      }

      // Insere linha vazia separadora entre datas diferentes
      if (idx > 0 && curDateKey !== lastDateKey) {
        dataRows.push(Array(17).fill(''));
      }
      lastDateKey = curDateKey;

      dataRows.push([
        r.name,
        r.format,
        r.validity || '',
        fmt(r.budget) ? fmtBRL(r.budget) : '',
        fmt(r.spent) ? fmtBRL(r.spent) : '',
        (o === 'Alcance' || o === 'Reels') ? fmtNum(r.reach) : '',
        (o === 'Engajamento' && isEF) ? fmtNum(r.eng) : '',
        (o === 'EngLink' || o === 'ConvLink') ? fmtNum(r.links) : '',
        o === 'Reels' ? fmtNum(r.views) : '',
        o === 'Alcance' ? fmtBRL(r.cpm) : '',
        (o === 'EngLink' || o === 'ConvLink') ? fmtBRL(r.cpc) : '',
        o === 'Reels' ? fmtBRL(r.cThru) : '',
        (o === 'Engajamento' && isEF) ? fmtBRL(r.cInt) : '',
        o === 'Conversas' ? fmtBRL(r.cConv) : '',
        '',
        '',
        o === 'Conversas' ? fmtNum(r.conv) : '',
      ]);
    });

    // ── 5. Manipular a aba Relatório ──────────────────────────
    // Estratégia: o modelo tem linhas 1 (título) e 2 (cabeçalho) fixas.
    // Linhas 3-4-5 são placeholders vazios antes do "RAIO-X".
    // Precisamos:
    // a) Limpar as linhas de placeholder (3 até raioX-1)
    // b) Inserir linhas suficientes pra caber os dados
    // c) Preencher os dados a partir da linha 3

    // Número de linhas de placeholder no modelo (entre cabeçalho e RAIO-X)
    // raioXRowIdx é 0-indexed, cabeçalho está na linha 2 (0-indexed: 1)
    // Então placeholders = raioXRowIdx - 2 (linhas 3 até raioX-1)
    const placeholderCount = raioXRowIdx > 2 ? raioXRowIdx - 2 : 0;
    const dataCount = dataRows.length;
    const diff = dataCount - placeholderCount;

    const batchRequests = [];

    if (diff > 0) {
      // Precisamos INSERIR linhas extras antes do RAIO-X
      batchRequests.push({
        insertDimension: {
          range: {
            sheetId: sheetId,
            dimension: 'ROWS',
            startIndex: raioXRowIdx, // insere ANTES do RAIO-X (0-indexed)
            endIndex: raioXRowIdx + diff,
          },
          inheritFromBefore: true,
        },
      });
    } else if (diff < 0) {
      // Temos linhas sobrando — deletar o excesso
      const deleteStart = 2 + dataCount; // logo após os dados (0-indexed)
      const deleteEnd = raioXRowIdx;     // até antes do RAIO-X
      if (deleteEnd > deleteStart) {
        batchRequests.push({
          deleteDimension: {
            range: {
              sheetId: sheetId,
              dimension: 'ROWS',
              startIndex: deleteStart,
              endIndex: deleteEnd,
            },
          },
        });
      }
    }

    // Executar insert/delete de linhas se necessário
    if (batchRequests.length > 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: batchRequests },
      });
    }

    // ── 6. Preencher os dados a partir de A3 ──────────────────
    if (dataRows.length > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Relatório!A3:Q${3 + dataRows.length - 1}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: dataRows },
      });
    }

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
