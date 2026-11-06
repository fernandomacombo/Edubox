# EduBox

Aprender na rede local da escola, mesmo sem Internet.

**v0.3.4 — um espaço visual para aprender.** Biblioteca, exercícios e um espaço pessoal com turmas, fichas, respostas e notas. Django + React/TypeScript + SQLite.

## Já tens a instalação dos ZIPs no Windows?

Fecha os servidores da instalação antiga. Precisas de Git para Windows, Python 3.12+ e Node.js 20, 22 ou 24+. Confirma espaço disponível para copiar a base e os documentos; a preparação preserva a pasta antiga.

No CMD:

```bat
cd /d D:\Downloads
git clone https://github.com/fernandomacombo/Edubox.git EduBox_Git
cd EduBox_Git
scripts\preparar_git_windows.bat
```

Quando o importador pedir a pasta antiga, indica a pasta que contém `backend` e `frontend`. O valor sugerido é `D:\Downloads\EduBox_MVP`.

A importação copia contas, turmas, fichas, notas, documentos públicos/privados e migrações anteriores. Não substitui dados num clone que já contenha uma base. Se interromper, consulta o erro antes de tentar novamente. A pasta original fica intacta.

Depois abre, em duas janelas:

```bat
scripts\iniciar_backend_windows.bat
```

```bat
scripts\iniciar_frontend_windows.bat
```

Abre **http://localhost:5173**. Usa as mesmas contas da instalação anterior. No telemóvel, usa o IP do computador com a porta 5173, na mesma rede Wi-Fi.

## Instalação nova

Depois de clonar, executa `scripts\instalar_windows.bat` em vez de importar. O script prepara as dependências, a base, conteúdos de demonstração e os grupos. Cria contas separadas de Professor e Aluno na administração.

A instalação/actualização de dependências precisa de Internet. A consulta de materiais locais não precisa. Ligações externas são identificadas como online.

## Actualizações seguintes

Fecha Django e Vite e executa:

```bat
scripts\atualizar_git_windows.bat
```

O script verifica alterações locais, procura novidades no Git e usa apenas avanço directo do histórico. Não sobrescreve código modificado localmente. Quando não há novidades, não cria backups nem reinstala dependências. Quando há, guarda um backup compacto do código, base e migrações antes de actualizar e testar. Os documentos não são alterados pelo Git. Ficheiros temporários são colocados em `runtime/tmp` no disco do projecto.

Se aparecer `ENOSPC`, falta espaço no disco; não repitas instalações nem apagues a base de dados. Liberta espaço e consulta o erro.

## Interface

- **Biblioteca:** pesquisa e filtros por classe, leitura de texto e abertura de documentos.
- **Exercícios:** perguntas com correcção local.
- **Meu espaço / professor:** fichas e turmas separadas; formulários abrem só quando necessários.
- **Meu espaço / aluno:** painel visual com fichas compactas, progresso de entregas e abertura de uma tarefa de cada vez; filtros Todas, Por fazer, A aguardar avaliação e Avaliadas, com notas e comentários.
- **Responder com calma:** rascunho automático no separador, revisão antes da entrega e confirmação explícita. Uma falha de envio mantém o texto para tentar novamente.
- **Ajuda e privacidade:** explicação do percurso e de quem pode consultar respostas e notas. Usa «Sair» num computador partilhado: os rascunhos locais são apagados. Não há sincronização de rascunhos entre dispositivos; fechar ou perder o separador pode perder o texto.
- Layout adaptável ao telemóvel, botões com texto, foco de teclado e opção para mostrar a palavra-passe.

## Desenvolvimento e testes

```sh
cd backend
python -m venv .venv
# Activar o ambiente virtual conforme o sistema
pip install -r requirements.txt
python manage.py makemigrations learning --noinput
python manage.py migrate
python manage.py configurar_v02
python manage.py test learning
```

```sh
cd frontend
npm ci
npm test
npm run build
npm audit
```

GitHub Actions executa os testes e a compilação em cada push/PR.

### Migrações e dados locais

As versões ZIP geravam migrações em cada computador. Nesta transição, os ficheiros numerados de migração continuam locais e ignorados pelo Git, para preservar esses históricos. O importador mantém os ficheiros existentes; instalações novas geram o esquema actual. A normalização desse histórico deve ser feita antes de distribuir futuras mudanças complexas de esquema.

Bases SQLite, documentos, backups, `.env`, dependências e caches não entram no repositório. Nunca coloques dados de alunos ou credenciais em commits.

## Limites

MVP para uma rede local de confiança, com servidores de desenvolvimento. Não é uma implantação pública na Internet. A biblioteca publicada é pública nessa rede; PDFs das fichas são privados e servidos com verificação de permissões.

A validação automática não substitui confirmar a instalação real em Windows e telemóvel. Ver `VALIDACAO.md`.
