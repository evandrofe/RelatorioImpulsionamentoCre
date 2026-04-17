# Relatórios Ads

Aplicativo web para importar planilhas `.xlsx` do Meta Ads, revisar e classificar campanhas, preencher a capa do relatório e gerar um Excel final formatado.

## Funcionalidades

- Importação de arquivo `.xlsx`
- Classificação de campanhas
- Regras configuráveis via JSON
- Suporte a aliases e normalização de nomes
- Preenchimento da capa do relatório
- Exportação de Excel final
- Persistência local com `localStorage`

## Como usar

1. Abra o aplicativo no navegador.
2. Faça upload da planilha do Meta Ads.
3. Revise ou ajuste as classificações das campanhas.
4. Preencha os dados da capa.
5. Gere e baixe o relatório final em Excel.

## Publicação no GitHub Pages

Este projeto foi preparado para rodar como site estático no GitHub Pages.

### Estrutura do repositório

```text
/
├── index.html
├── README.md
├── .gitignore
└── DEPLOY_CHECKLIST.md
```

### Como publicar

1. Crie um novo repositório no GitHub.
2. Envie os arquivos deste projeto para a raiz do repositório.
3. Vá em **Settings > Pages**.
4. Em **Build and deployment**, selecione:
   - **Source**: `Deploy from a branch`
   - **Branch**: `main`
   - **Folder**: `/ (root)`
5. Salve as configurações.
6. Aguarde a URL pública do GitHub Pages ser gerada.

A URL final costuma ficar assim:

```text
https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/
```

## Observações

- O app roda 100% no navegador.
- Os dados salvos com `localStorage` ficam no navegador do usuário.
- Não é necessário backend para a versão atual.
- Se houver dependências externas por CDN, elas precisam estar acessíveis online.

## Desenvolvimento local

Você pode abrir o `index.html` direto no navegador.  
Para publicar, basta manter o arquivo principal com o nome `index.html`.

## Licença

Defina aqui a licença do projeto, se desejar.
