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
