# Lista de espera do Atlas

O formulário da landing page envia os cadastros para \`POST /api/waitlist\`. A
função serverless encaminha o e-mail para o Google Apps Script, que grava os
dados em uma planilha do Google Sheets.

## 1. Criar a planilha

Crie uma planilha no Google Sheets com uma aba chamada \`Lista de espera\`.
Na primeira linha, use estes cabeçalhos:

\`\`\`text
email | cadastrado_em | consentimento_em | origem
\`\`\`

## 2. Configurar o Apps Script

1. Abra a planilha e acesse **Extensões > Apps Script**.
2. Copie o conteúdo de \`integrations/google-sheets/waitlist.gs\` para o editor.
3. Em **Configurações do projeto > Propriedades do script**, crie:
   - Propriedade: \`WAITLIST_SHARED_SECRET\`
   - Valor: uma sequência aleatória longa, por exemplo com pelo menos 32 caracteres.
4. Clique em **Implantar > Nova implantação**.
5. Escolha **Aplicativo da Web**, execute como você e permita acesso a qualquer
   pessoa.
6. Copie a URL terminada em \`/exec\`.

A URL pode ser pública porque o script exige o segredo compartilhado antes de
gravar qualquer dado. Nunca coloque esse segredo no código do navegador.

## 3. Configurar a Vercel

Adicione estas variáveis de ambiente no projeto da Vercel:

\`\`\`text
GOOGLE_APPS_SCRIPT_URL=https://script.google.com/macros/s/.../exec
GOOGLE_SHEETS_SHARED_SECRET=mesmo-segredo-configurado-no-script
\`\`\`

Configure as variáveis nos ambientes **Preview** e **Production**. Para
desenvolvimento local, copie \`.env.example\` para \`.env.local\` e preencha os
valores.

## 4. Testar

1. Publique um deploy de Preview.
2. Cadastre um e-mail real pelo formulário.
3. Confirme a mensagem de sucesso na página e a nova linha na planilha.
4. Envie o mesmo e-mail novamente e confirme que nenhuma segunda linha foi
   criada.
5. Verifique as execuções do Apps Script caso o formulário mostre uma mensagem
   de erro.

Sem as duas variáveis de ambiente, o endpoint retorna erro de configuração e a
landing page informa que o cadastro não pôde ser concluído. Isso evita
confirmar inscrições que não foram gravadas.
