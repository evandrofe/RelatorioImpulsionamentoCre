// Rota que recebe o retorno do Google depois que você autoriza.
// Troca o "code" por tokens e MOSTRA o refresh_token na tela pra você copiar.
// Depois que copiar e colar o token na env var GOOGLE_REFRESH_TOKEN, essa rota não é mais usada.

const { google } = require('googleapis');

module.exports = async function handler(req, res) {
  const { code, error } = req.query || {};

  if (error) {
    return res.status(400).send(`<h1>Erro na autorização</h1><p>${error}</p>`);
  }

  if (!code) {
    return res.status(400).send('<h1>Faltou o parâmetro "code".</h1>');
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_OAUTH_CLIENT_ID,
      process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      process.env.GOOGLE_OAUTH_REDIRECT_URI
    );

    const { tokens } = await oauth2Client.getToken(code);

    const refreshToken = tokens.refresh_token || '(NÃO RETORNADO — ver aviso abaixo)';
    const accessToken = tokens.access_token || '';
    const expiresIn = tokens.expiry_date
      ? new Date(tokens.expiry_date).toISOString()
      : '';

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>Refresh Token gerado</title>
        <style>
          body { font-family: 'Segoe UI', sans-serif; background: #0f0f0f; color: #e5e5e5; padding: 40px; max-width: 800px; margin: auto; line-height: 1.6; }
          h1 { color: #ff9900; }
          h2 { color: #fff; margin-top: 30px; }
          code, pre { background: #1a1a1a; border: 1px solid #333; border-radius: 8px; padding: 12px; display: block; word-break: break-all; color: #ffd08a; font-size: 13px; }
          .warn { background: rgba(180,83,9,.15); border: 1px solid rgba(245,158,11,.45); border-radius: 8px; padding: 16px; color: #fef3c7; margin-top: 20px; }
          .ok { background: rgba(21,128,61,.10); border: 1px solid rgba(21,128,61,.45); border-radius: 8px; padding: 16px; color: #dcfce7; margin-top: 20px; }
          ol li { margin-bottom: 8px; }
        </style>
      </head>
      <body>
        <h1>🎉 Autorização concluída!</h1>
        <p>Copie o <strong>Refresh Token</strong> abaixo e configure como env var na Vercel.</p>

        <h2>Refresh Token (copie esse valor)</h2>
        <pre>${refreshToken}</pre>

        <div class="ok">
          <strong>Próximos passos:</strong>
          <ol>
            <li>Copie o valor acima.</li>
            <li>Abra <a href="https://vercel.com/evandroferraz15-5373s-projects/relatorio-impulsionamento-cre/settings/environment-variables" target="_blank" style="color:#ffd08a">as env vars da Vercel</a>.</li>
            <li>Clique em <strong>Add New</strong> e adicione:<br>
              Key: <code style="display:inline;padding:2px 8px">GOOGLE_REFRESH_TOKEN</code><br>
              Value: (cole o refresh token aqui)
            </li>
            <li>Marque Production, Preview e Development.</li>
            <li>Salve e clique em <strong>Redeploy</strong> para aplicar as mudanças.</li>
            <li>Pronto! O botão "Google Sheets" do app vai funcionar.</li>
          </ol>
        </div>

        <div class="warn">
          <strong>⚠️ Se o Refresh Token estiver vazio:</strong> isso acontece quando você já autorizou esse app antes.
          Vá em <a href="https://myaccount.google.com/permissions" target="_blank" style="color:#fef3c7">myaccount.google.com/permissions</a>,
          encontre "Relatórios Ads Creative", remova o acesso, e acesse novamente
          <code style="display:inline">/api/oauth-authorize</code>.
        </div>

        <details style="margin-top:30px">
          <summary style="cursor:pointer;color:#9ca3af">Info técnica (opcional)</summary>
          <p><strong>Access Token (expira em 1h):</strong></p>
          <pre>${accessToken}</pre>
          <p><strong>Expira em:</strong> ${expiresIn}</p>
        </details>
      </body>
      </html>
    `;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(html);
  } catch (err) {
    console.error('Erro no oauth-callback:', err);
    res.status(500).send(`<h1>Erro ao trocar code por tokens</h1><pre>${err.message}</pre>`);
  }
};
