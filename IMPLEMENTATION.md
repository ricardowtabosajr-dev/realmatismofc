# Soccer Team Manager - Plano de Implementação

Construindo um sistema profissional de gestão para times de futebol, com foco em convocações de jogos e controle financeiro.

## Funcionalidades Principais
1. **Gestão de Atletas**
   - Cadastrar atletas (Nome, Posição, Contato).
   - Listar e buscar atletas.
2. **Gestão de Jogos**
   - Criar jogos (Adversário, Data, Hora, Local).
   - Upload/Seleção de escudos dos times.
3. **Convocações (Lista de Jogadores)**
   - Selecionar atletas para jogos específicos.
   - Acompanhar status de pagamento (Pago/Pendente).
   - Definir taxa de participação.
4. **Integração com WhatsApp**
   - Gerar lista de convocação formatada.
   - Incluir status de pagamento e chaves PIX individuais.
5. **Dashboard / Visão Geral Financeira**
   - Total de receita esperada vs. coletada por jogo.

## Pilha Tecnológica
- **Framework**: Vite + React + TypeScript
- **Styling**: Vanilla CSS (Premium Dark Theme)
- **State Management**: React Context + LocalStorage (Initial Phase)

## Design System
- **Primary Color**: #2ecc71 (Grass Green)
- **Secondary Color**: #f1c40f (Gold)
- **Background**: #0f172a (Deep Slate)
- **Surface**: #1e293b (Light Slate)
- **Fonts**: Inter / Outfit

## Roadmap
- [x] Project Setup & Basic Styling
- [x] Athlete Registration UI
- [x] Game Creation & Logo Selection
- [x] Convocation & Payment UI
- [x] WhatsApp Text Generation
- [x] Financial Dashboard
