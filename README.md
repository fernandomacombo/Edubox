# EduBox

Aprender na rede local da escola, mesmo sem Internet.

**v0.3.7 — direcção escolar, actividades, correcções e transferências.** Biblioteca, exercícios e um espaço pessoal com turmas, fichas, respostas e notas. Django + React/TypeScript + SQLite.

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

- **Biblioteca:** ebooks (PDF), livros, pesquisas, vídeos, documentos, imagens e outros materiais. Pesquisa por título/autor/tema, filtros por tema, tipo, disponibilidade e, opcionalmente, classe/disciplina. Livros de leitura geral não precisam de disciplina nem classe. O catálogo é visível na rede; a leitura exige uma conta da escola e permite consultar materiais de diferentes classes.
- **Exercícios:** perguntas com correcção local, acessíveis apenas às turmas explicitamente autorizadas. A inscrição numa turma não dá acesso às outras turmas da mesma classe.
- **Meu espaço / professor:** painel visual com turmas que abrem para fichas, alunos e avaliações. Contadores de inscrições, fichas, entregas e respostas por avaliar; pesquisa de alunos e fichas, inscrição na turma e nova ficha com a turma pré-seleccionada. A fila de avaliações abre directamente as respostas e actualiza os totais ao guardar a nota. Cada ficha mostra também quem ainda não entregou.
- **Meu espaço / aluno:** pesquisa de fichas e filtro por turma combináveis com o estado da entrega; painel visual com fichas compactas, progresso de entregas e abertura de uma tarefa de cada vez; filtros Todas, Por fazer, A aguardar avaliação e Avaliadas, com notas e comentários.
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

MVP para uma rede local de confiança, com servidores de desenvolvimento. Não é uma implantação pública na Internet. O catálogo da biblioteca é visível nessa rede; conteúdos completos exigem sessão. Fichas, respostas, exercícios e anúncios verificam a turma no servidor. Os PDFs originais não são servidos ao leitor: cada página é renderizada com identificação da conta.

A validação automática não substitui confirmar a instalação real em Windows e telemóvel. Ver `VALIDACAO.md`.

## Organizar a biblioteca e autorizar exercícios

Com a conta de administrador da escola, abre **Meu espaço → Gerir biblioteca**. Escolhe o tipo, tema (Literatura, História, Cultura moçambicana, etc.), autor, idioma e descrição. A disciplina/classe é opcional. Carrega o ficheiro local (PDF, MP4 ou imagem, até 80 MB), indica a origem/licença e guarda em rascunho ou publica. Ebooks usam PDF nesta versão. A gestão da biblioteca é exclusiva da escola, incluindo na administração Django; professores consultam e associam materiais às actividades, mas não editam o acervo. Registos antigos de áudio ficam preservados para a escola e ocultos do catálogo/leitor, sem apagar os ficheiros. Os materiais já existentes ficam em «Outros materiais» até serem classificados. Trabalhos e respostas de alunos não são promovidos automaticamente à biblioteca.

Em **Testes**, o administrador selecciona **Turmas autorizadas** da classe correspondente. Exercícios antigos sem turmas permanecem guardados, mas não ficam visíveis aos alunos até receberem essa atribuição. Fichas publicadas no portal já pertencem a uma turma e mantêm o seu acesso.

## Anúncios e notificações

O professor abre o sino **Avisos → Novo anúncio** e escolhe uma turma ou «Todas as minhas turmas». O aluno vê o contador de avisos não lidos e pode marcar cada mensagem como lida. O sino aparece também durante a consulta da biblioteca. A lista actualiza a cada 30 segundos enquanto a aplicação está aberta e ligada à rede EduBox; não é uma notificação do sistema operativo com a aplicação fechada.

## Consulta de materiais e limites da protecção

- PDFs e imagens: leitor interno, páginas identificadas com a conta do leitor, sem disponibilizar o ficheiro original.
- Vídeo: reprodução local com ligações temporárias associadas à conta e à sessão; controlos de descarga ocultos onde o navegador suporta.
- Ficheiros antigos em `/media/` deixam de poder ser abertos directamente. Links externos ficam conservados na administração, mas não são oferecidos como alternativa para contornar o leitor; materiais apenas online devem receber uma versão local autorizada para leitura interna.
- Não há botões de descarga ou impressão no leitor. Isto **não é DRM absoluto**: capturas de ecrã, gravação do ecrã e cópia por um utilizador autorizado com ferramentas técnicas continuam possíveis.
- A instalação inicial/actualização necessita de Internet para instalar também PDFium e Pillow; a leitura e as notificações usam a rede local, sem serviços externos.

A actualização gera migrações aditivas sobre o histórico local existente, com o backup compacto já previsto pelo actualizador. A simulação de passagem da v0.3.5 preservou contas, turma, inscrição, ficha, resposta, nota e material. Não se distribuem migrações numeradas para não colidir com as instalações ZIP anteriores.


## Direcção, informes e transferências (v0.3.7)

O superutilizador existente é a conta de direcção. Em **Meu espaço**, encontra Informes, Gerir biblioteca e Transferências. Contas e disciplinas continuam acessíveis pela ligação à administração.

- **A escola:** mural público na rede local com informes oficiais. A direcção guarda rascunhos, publica, edita e retira a publicação. Só informes publicados aparecem no mural e nas notificações de alunos/professores; uma alteração de texto publicada renova o estado por ler.
- **Substituir professor:** selecciona a turma e o novo responsável, indica o motivo, revê e confirma. Actividades, entregas, notas e avisos continuam na turma; o professor anterior perde o acesso à turma. Repete para cada turma de um professor que sai; a conta pode ser desactivada pela direcção na administração depois da passagem de responsabilidade.
- **Transferir aluno:** escolhe origem, aluno e destino. A inscrição muda; as actividades da turma anterior deixam de estar acessíveis. As próprias entregas antigas continuam em **Histórico de turmas anteriores**, sem expor materiais ou respostas de colegas.
- **Saída para outra escola:** a revisão explicita que todas as inscrições são removidas e a conta é desactivada. Entregas e notas ficam conservadas na escola de origem. Não há transmissão automática de dados para outra instalação EduBox.
- Todas as transferências por este fluxo têm registo de autor, data, motivo, origem e destino. Não uses a edição manual de inscrições/responsáveis para substituir este fluxo auditado.

## Exercícios, grupos e avaliações

Ao criar uma ficha, selecciona **Exercício**, **Trabalho em grupo** ou **Avaliação**. Os cartões mostram o tipo e a lista permite filtrar. Os exercícios interactivos de escolha múltipla continuam a ser prática com correcção automática, distintos das avaliações entregues ao professor.

Em trabalhos de grupo, abre **Gerir actividade, grupos e correcção**, cria grupos de pelo menos dois alunos inscritos e define os membros. Cada aluno pertence a um único grupo por actividade. Uma pessoa entrega; a resposta é registada para todos os membros ainda inscritos. Ao avaliar um membro, a nota e o comentário aplicam-se a todo esse grupo. Membros transferidos não recebem novas entregas da antiga turma. A composição é conservada para proteger o histórico; não há reorganização de grupos já criados nesta versão.

O professor pode guardar a resolução como rascunho. Para publicar a correcção, encerra as entregas e avalia as respostas recebidas. Só então selecciona **Publicar a correcção para esta turma** e guarda. O servidor recusa publicação enquanto houver entregas abertas ou respostas por avaliar. Reabrir entregas exige retirar a publicação da resolução. Uma resolução já vista por alunos não pode ser tornada desconhecida por a ocultar.

Mensagens visíveis indicam **A guardar…**, sucesso ou erro. Os botões bloqueiam durante o pedido. Uma gravação confirmada seguida de falha ao actualizar a lista é comunicada como gravada, sem pedir que a pessoa volte a enviar. O rascunho do aluno continua local ao separador e informa claramente que ainda não foi entregue.
