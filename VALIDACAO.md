# Validação da v0.3.2

- 28 testes backend passaram novamente nesta revisão.
- 5 testes React passaram e cobrem as três modalidades de documentos, limpeza ao mudar de turma e abertura/fecho dos formulários.
- TypeScript e compilação Vite verificados nesta revisão.
- Vitest actualizado de 3.2.7 para 4.1.12. `npm audit` passou de três avisos para zero na verificação local de 4 de Novembro de 2026. Isto descreve a auditoria de dependências dessa data, não uma garantia de ausência de falhas.
- Scripts Windows ainda requerem confirmação no computador real. A importação preserva a origem e recusa sobrescrever uma base de destino.
- Dados demonstrativos e bases usadas nos testes não estão no Git.

- 3 testes do importador passaram: cópia dos dados/histórico, recusa de destino ocupado e falta de espaço.

- Navegador Chromium: biblioteca, publicação pelo professor, resposta e filtros do aluno, com API simulada. Layout verificado a 1440 px e 390 px; sem transbordo horizontal no telemóvel. Não equivale a um ensaio físico no Windows/iPhone.
