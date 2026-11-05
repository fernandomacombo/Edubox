# EduBox — plano incremental

## Fase 1 — Protótipo LAN (versão 0.1)
- [x] Modelos de disciplinas, materiais e testes
- [x] API Django e gestão administrativa
- [x] Portal React com filtro, biblioteca, exercícios e correcção
- [x] Aulas e testes originais de demonstração
- [ ] Executar dependências, migrações, testes Django e build React num ambiente com Internet
- [ ] Piloto num computador e telemóvel ligados à mesma rede Wi-Fi

## Fase 2 — MVP para uma escola
- [ ] Contas e perfis (escola, professor, aluno), com protecção de dados de menores
- [ ] Atribuição de turmas, disciplinas, permissões e histórico escolar
- [ ] Criador visual de fichas e testes, sem depender apenas do Django Admin
- [ ] Upload e organização de materiais com análise de formatos/segurança
- [ ] Sistema de cópias de segurança locais e actualização de conteúdos
- [ ] Instalação como serviço Linux num mini-PC, com HTTPS, firewall e recuperação automática
- [ ] Testes de desempenho para número real de alunos simultâneos

## Fase 3 — Online + sincronização
- [ ] API cloud autenticada e registo de dispositivos/escolas
- [ ] Sincronização incremental de materiais e notas quando a Internet regressa
- [ ] Gestão de conflitos, versão dos conteúdos e filas de eventos
- [ ] Aplicação PWA para descarregar conteúdos autorizados para o telemóvel
- [ ] Painel agregado, relatórios e apoio técnico remoto autorizado

## Fase 4 — Expansão e produto
- [ ] Conteúdos alinhados e validados para o currículo moçambicano
- [ ] Licenciamento com editoras e repositórios de recursos educacionais abertos
- [ ] Interface em português acessível e opções de línguas locais
- [ ] IA educativa offline, sujeita a testes de qualidade e viabilidade do hardware
- [ ] Caixa EduBox com hardware homologado, alimentação estável e opção solar
- [ ] Pilotos formais e preço sustentável (instalação + manutenção anual)

## Critérios para o primeiro piloto
1. Um professor publica uma aula original em texto e um PDF autorizado.
2. Dois telemóveis acedem via Wi-Fi à caixa/computador sem dados móveis.
3. Um aluno abre a aula e faz um teste; a correcção ocorre localmente.
4. A plataforma mantém-se disponível durante uma falha da Internet externa.
5. O conteúdo permanece acessível depois de reiniciar o servidor local.
