// Callback OAuth — versão melhorada com:
// - Botão "Copiar" confiável (sem risco de pegar caractere invisível)
// - Mostra explicitamente os scopes que o token tem
// - Mostra o email da conta autorizada

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

    const refreshToken = tokens.refresh_token || '';
    const scopes = tokens.scope || '';
    const hasDriveScope = scopes.includes('auth/drive') && !scopes.includes('drive.file');
    const hasDriveFullScope = scopes.split(' ').some(s => s.endsWith('/auth/drive'));

    // Descobre o email
    let email = '(não detectado)';
    try {
      oauth2Client.setCredentials(tokens);
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
      const userinfo = await oauth2.userinfo.get();
      email = userinfo.data.email;
    } catch (e) {
      email = '(erro ao consultar: ' + e.message + ')';
    }

    const hasToken = !!refreshToken;

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Refresh Token gerado</title>
<style>
  body{font-family:'Segoe UI',sans-serif;background:#0f0f0f;color:#e5e5e5;padding:40px;max-width:800px;margin:auto;line-height:1.6}
  h1{color:#ff9900}
  h2{color:#fff;margin-top:30px;font-size:16px}
  .token-box{background:#1a1a1a;border:2px solid #ff9900;border-radius:8px;padding:16px;word-break:break-all;color:#ffd08a;font-size:13px;font-family:monospace;margin-bottom:10px}
  button{background:#ff9900;color:#000;border:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer}
  button:hover{background:#e68900}
  button.copied{background:#16a34a;color:#fff}
  .info-row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #333}
  .info-row:last-child{border-bottom:none}
  .info-label{color:#9ca3af;font-size:13px}
  .info-value{color:#fff;font-size:13px;font-family:monospace}
  .ok{background:rgba(21,128,61,.10);border:1px solid rgba(21,128,61,.45);border-radius:8px;padding:16px;color:#dcfce7;margin-top:20px}
  .warn{background:rgba(180,83,9,.12);border:1px solid rgba(245,158,11,.45);border-radius:8px;padding:16px;color:#fef3c7;margin-top:20px}
  .err{background:rgba(153,27,27,.2);border:1px solid rgba(239,68,68,.45);border-radius:8px;padding:16px;color:#fecaca;margin-top:20px}
  ol li{margin-bottom:8px}
  code{background:#1a1a1a;padding:2px 8px;border-radius:4px;color:#ffd08a;font-size:12px}
</style>
</head>
<body>
  <h1>🎉 Autorização concluída!</h1>

  <h2>📋 Info da autorização</h2>
  <div style="background:#171717;border:1px solid #2c2c2c;border-radius:8px;padding:16px">
    <div class="info-row">
      <span class="info-label">Conta autorizada:</span>
      <span class="info-value">${email}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Escopo Drive completo:</span>
      <span class="info-value">${hasDriveFullScope ? '✅ SIM' : '❌ NÃO'}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Refresh token gerado:</span>
      <span class="info-value">${hasToken ? '✅ SIM' : '❌ NÃO'}</span>
    </div>
  </div>

  ${!hasDriveFullScope ? `
  <div class="err">
    <strong>⚠️ Escopo Drive completo NÃO está no token!</strong>
    <p>Isso significa que o Google Cloud ainda não tem o escopo <code>/auth/drive</code> habilitado, ou você não clicou em "Save" depois de adicioná-lo. Verifique e tente de novo.</p>
  </div>` : ''}

  ${hasToken ? `
  <h2 style="margin-top:30px">🔑 Refresh Token</h2>
  <div class="token-box" id="tokenBox">${refreshToken}</div>
  <button id="copyBtn" onclick="copyToken()">📋 Copiar Refresh Token</button>

  <div class="ok">
    <strong>✅ Próximos passos:</strong>
    <ol>
      <li>Clique no botão <strong>"Copiar Refresh Token"</strong> acima</li>
      <li>Abra <a href="https://vercel.com/evandroferraz15-5373s-projects/relatorio-impulsionamento-cre/settings/environment-variables" target="_blank" style="color:#ffd08a">as env vars da Vercel</a></li>
      <li>Em <code>GOOGLE_REFRESH_TOKEN</code>, clique em <strong>Edit</strong></li>
      <li>Apague o valor antigo (Ctrl+A → Delete)</li>
      <li>Cole o novo valor (Ctrl+V)</li>
      <li>Salve e clique em <strong>Redeploy</strong></li>
    </ol>
  </div>

  <script>
    async function copyToken() {
      const token = ${JSON.stringify(refreshToken)};
      try {
        await navigator.clipboard.writeText(token);
        const btn = document.getElementById('copyBtn');
        btn.textContent = '✅ Copiado! Cole na Vercel';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = '📋 Copiar Refresh Token';
          btn.classList.remove('copied');
        }, 3000);
      } catch (e) {
        alert('Erro ao copiar: ' + e.message + '\\nCopie manualmente o texto acima.');
      }
    }
  </script>
  ` : `
  <div class="err">
    <strong>❌ Refresh token vazio!</strong>
    <p>Isso acontece quando você já autorizou esse app antes. Vá em
      <a href="https://myaccount.google.com/permissions" target="_blank" style="color:#fef3c7">myaccount.google.com/permissions</a>,
      remova o acesso do app "Relatório de Impulsionamento", e acesse
      <code>/api/oauth-authorize</code> novamente.</p>
  </div>`}

  <details style="margin-top:30px">
    <summary style="cursor:pointer;color:#9ca3af">🔍 Info técnica (debug)</summary>
    <p style="font-size:12px;color:#9ca3af;margin-top:10px">Scopes no token:</p>
    <pre style="background:#1a1a1a;padding:12px;border-radius:6px;font-size:11px;color:#ffd08a;white-space:pre-wrap">${scopes.split(' ').join('\n')}</pre>
  </details>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(html);
  } catch (err) {
    console.error('Erro no oauth-callback:', err);
    res.status(500).send(`<h1>Erro ao trocar code por tokens</h1><pre>${err.message}</pre>`);
  }
};
