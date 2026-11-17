# Validação da v0.3.4

- 14 testes React e compilação TypeScript/Vite passaram.
- A página inicial do aluno apresenta cartões compactos e abre apenas a tarefa seleccionada. O regresso ao painel mantém o rascunho.
- Os testes verificam navegação, filtros, nota zero, revisão, entrega, falhas de ligação e privacidade entre contas.
- Chromium com API simulada: painel a 1440 e 390 px, navegação, recuperação do rascunho e entrega passaram; sem transbordo horizontal no telemóvel.
- Sem alterações ao backend ou esquema da base de dados.

# Validação da v0.3.3

- 13 testes React passaram: 5 testes existentes do professor e 8 novos testes do aluno.
- Novos cenários: recuperação do rascunho, isolamento por conta/ficha, revisão e confirmação, regresso ao campo por teclado, falha de envio e repetição, bloqueio de duplo clique, armazenamento indisponível, resposta vazia, limpeza ao sair, filtros, nota zero e mudança de sessão antes da entrega.
- TypeScript e compilação Vite passaram.
- Chromium: rascunho após recarregar, revisão, regresso à escrita e entrega verificados com API simulada. Ecrãs a 390 e 1440 px; sem transbordo horizontal no telemóvel.
- Sem alterações ao esquema da base de dados ou às permissões do servidor.
- Rascunhos usam sessionStorage: apenas o separador actual, sem sincronização com servidor. «Sair» limpa os rascunhos EduBox no separador. Não é armazenamento permanente nem protege uma conta deixada aberta.
- A integração com a API nos testes React é simulada. Confirmar a actualização real no Windows e o uso no telemóvel continua necessário.

## Histórico da v0.3.2


- 28 testes backend passaram novamente nesta revisão.
- 5 testes React passaram e cobrem as três modalidades de documentos, limpeza ao mudar de turma e abertura/fecho dos formulários.
- TypeScript e compilação Vite verificados nesta revisão.
- Vitest actualizado de 3.2.7 para 4.1.12. `npm audit` passou de três avisos para zero na verificação local de 4 de Novembro de 2026. Isto descreve a auditoria de dependências dessa data, não uma garantia de ausência de falhas.
- Scripts Windows ainda requerem confirmação no computador real. A importação preserva a origem e recusa sobrescrever uma base de destino.
- Dados demonstrativos e bases usadas nos testes não estão no Git.

- 3 testes do importador passaram: cópia dos dados/histórico, recusa de destino ocupado e falta de espaço.

- Navegador Chromium: biblioteca, publicação pelo professor, resposta e filtros do aluno, com API simulada. Layout verificado a 1440 px e 390 px; sem transbordo horizontal no telemóvel. Não equivale a um ensaio físico no Windows/iPhone.


## v0.3.5 — turmas e ferramentas de acompanhamento

- Professor: abrir um cartão de turma mostra apenas as fichas dessa turma. «Todas as turmas» regressa à lista.
- Dentro da turma: alternar entre Fichas, Alunos e Avaliações; pesquisar e inscrever alunos; criar ficha com turma pré-seleccionada.
- Avaliações: abrir a ficha da fila pendente, guardar nota (incluindo zero) e confirmar que o contador diminui. Uma falha mantém a nota escrita para nova tentativa.
- Ficha: consultar quem ainda não entregou; rever respostas já avaliadas pelo separador Fichas.
- Aluno: combinar pesquisa, turma e estado; abrir tarefa, escrever rascunho, voltar e reabrir; consultar nota e comentário do professor.
- Verificar em ecrã estreito (390 px) e computador; navegação por teclado nos cartões.
- Confirmar também na instalação Windows e no telemóvel ligado à rede local, sem acesso à Internet.

Validação de desenvolvimento: 30 testes Django, 18 testes frontend, 3 testes do importador e compilação TypeScript/Vite. Nenhuma alteração de modelo ou migração incluída. A captura automatizada do navegador ficou bloqueada pelo ambiente de execução (socket do Chromium); a validação visual real e o teste offline em Windows continuam pendentes.

## v0.3.6 — biblioteca, isolamento e notificações

Validação automatizada: 44 testes Django, 25 testes frontend, 3 testes do importador; compilação TypeScript/Vite e auditoria npm. Simulação real de migração aditiva desde o esquema v0.3.5 com preservação de contas, turma, inscrição, ficha, resposta, nota e material.

Percurso para confirmar no Windows:

1. Aluno inscrito apenas na 8A: não vê fichas nem exercícios da 8B ou 9A. Links directos e envio de respostas para outra turma são recusados.
2. O mesmo aluno pode consultar materiais publicados de 9.ª classe na biblioteca após iniciar sessão; o catálogo não fornece o texto completo nem os endereços dos ficheiros.
3. Abrir um PDF no leitor, mudar de página e confirmar a identificação do leitor. O PDF original não abre por `/media/` nem pelo antigo endereço de descarga da ficha.
4. Reproduzir áudio/vídeo local e avançar na reprodução; tentar a ligação de reprodução noutra sessão deve ser recusado.
5. Professor publica anúncio para uma turma; só os seus inscritos recebem o aviso. «Todas as minhas turmas» não inclui turmas de outro professor.
6. Aluno marca aviso como lido; a marca mantém-se depois de sair e voltar. Sem ligação ao servidor, o painel informa a falha de actualização.
7. Confirmar categorias, filtros, leitor e sino no computador e telemóvel da mesma rede, sem Internet.

A pré-visualização por navegador remoto não alcançou o servidor local (ligação recusada). A validação visual real em Windows/telemóvel continua necessária. A protecção de leitura reduz a descarga directa e bloqueia acessos não autorizados; não impede capturas de ecrã ou gravação da reprodução.


## v0.3.7 — gestão escolar e continuidade pedagógica

- 59 testes Django, 31 testes React e 3 testes do importador (93 no total), compilação TypeScript/Vite.
- Testes de correcção: rascunho não exposto, publicação apenas após encerramento e avaliação, isolamento de turma e recusa de reabertura com resolução publicada.
- Grupos: validação de membros, uma entrega por grupo, avaliação comum, proibição de auto-inscrição e exclusão de membros transferidos das novas entregas.
- Escola: biblioteca sem classe, upload de ebook PDF, áudio antigo preservado mas inacessível, professor staff sem autorização para gerir acervo, informes em rascunho privados e informes publicados com recibos de leitura independentes.
- Transferências: autorização exclusiva da direcção, motivo obrigatório, repetição recusada, passagem de responsabilidade, acesso antigo revogado, histórico pessoal preservado e saída externa com conta desactivada.
- Interface: confirmação visível e bloqueio de submissão duplicada enquanto aguarda resposta; revisão da transferência; formulário de correcção; escolha de membros; biblioteca geral e mural.
- Simulação de actualização desde o esquema v0.3.6 em SQLite temporário: preservados utilizadores, turma, inscrição, actividade, resposta, nota, material e aviso. Novas propriedades recebem valores conservadores (exercício, entregas abertas, correcção não publicada).
- Chromium local não iniciou no ambiente de execução. Não foi possível verificar visualmente esta versão aqui; confirmar no Windows/telemóvel, incluindo navegação por teclado, leitores e disposição em ecrã estreito.

Percurso de aceitação na escola:
1. Entrar como administrador, publicar um informe e confirmar no mural **A escola** e nos avisos de aluno/professor.
2. Criar ebook PDF com tema Literatura e sem disciplina; encontrar na biblioteca em Leitura geral.
3. Professor cria uma avaliação, aluno entrega, professor guarda nota e resolução; só publicar a correcção depois de encerrar entregas.
4. Criar trabalho em grupo, atribuir dois membros, entregar com um deles e verificar resposta/nota no outro.
5. Transferir uma turma para outro professor e confirmar os acessos nas duas contas. Transferir um aluno entre turmas e confirmar o histórico sem acesso a novas tarefas da origem.
6. Confirmar **A guardar…** e mensagem de sucesso ao guardar nota, actividade, grupo, informe e material. Simular perda de ligação e confirmar que não aparece um falso sucesso.


## v0.3.8 — cadastro, gestão e documentos oficiais

- 71 testes Django e 38 testes React, além dos 3 testes do importador (112 no total); compilação TypeScript/Vite.
- Cadastro único por instalação e gravação exclusiva pela direcção; informação interna não exposta no cadastro público.
- Contas: palavras-passe com hash, validação de força, permissões e impossibilidade de elevar privilégios pela API. Edição sem palavra-passe preserva a actual; transferência obrigatória antes de desactivar contas com inscrições/turmas.
- Turmas primárias e secundárias (1 a 12), inscrição administrativa e recusa de responsável sem perfil Professor.
- Presenças únicas por turma/aluno/dia; actualização sem duplicar, recusa de data futura e aluno não inscrito; histórico conservado após transferência.
- Calendário: rascunhos privados, eventos publicados no mural, resumo com dados reais.
- Informes PDF: título/documento sem texto aceite; validação de PDF; rascunhos bloqueados para visitantes e professores; páginas de documento publicado acessíveis, original inacessível, retirada de publicação revoga o leitor. Remover o único conteúdo é recusado.
- Interface: cadastro e feedback de gravação, criação de contas, limpeza de palavra-passe após sucesso, presenças sem duplo envio, calendário, navegação da visão geral e informe enviado como multipart e aberto pelo leitor protegido.
- Simulação em SQLite temporário desde v0.3.7: entregas, notas, resolução, biblioteca sem classe, informes, inscrições e registos de transferência preservados. Cadastro começa vazio e nenhum dado fictício de escola é introduzido.
- Chromium não conseguiu iniciar devido à restrição de sockets do ambiente; a disposição visual em Windows e telemóvel ainda precisa de confirmação na instalação real.

Aceitação em Windows: actualizar, ligar servidores, entrar como administrador, registar a escola, criar uma conta de teste, inscrever numa turma, guardar uma presença, publicar um evento e um informe PDF. Confirmar que o mural mostra a identidade da escola, o evento e o documento, e que um informe em rascunho permanece privado.
