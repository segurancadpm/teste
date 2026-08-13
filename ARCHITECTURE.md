# DPM EPI — Arquitetura alvo

## Princípio
O sistema deve tratar cada artigo/modelo como uma entidade com **ID estável**. O nome apresentado ao utilizador pode mudar; o ID não.

## Fluxo empresarial

`Catálogo → Compras → Entradas de stock → Stock por armazém → Entregas → Trabalhador → Devoluções`

Em paralelo:

`Catálogo + Compras → Orçamento → Execução → Custo por trabalhador`

## Entidades principais

- **Article / EPI** — catálogo, código, modelo, unidade, preço de referência, riscos e estado.
- **Worker** — trabalhador e respetiva delegação.
- **Warehouse** — DPM Norte, DPM Sul, DPM Algarve e futuras localizações.
- **Supplier** — fornecedor e dados comerciais.
- **Purchase** — movimento financeiro: fornecedor, fatura, data, artigo, quantidade, preço e IVA.
- **Stock movement** — entrada, saída, transferência, devolução ou ajuste.
- **Delivery** — entrega de EPI a trabalhador, incluindo responsável e assinatura quando aplicável.
- **Budget plan** — quantidade autorizada × preço unitário.
- **Audit event** — quem, quando, ação, entidade e alteração efetuada.

## Regras de negócio

1. Comprar **600 unidades** de um EPI é uma compra de 600 unidades; não são 600 artigos diferentes.
2. O orçamento planeado é separado do gasto real.
3. O stock aumenta com entradas e diminui com saídas/devoluções conforme o tipo de movimento.
4. Entregas devem referenciar `articleId`, `workerId` e `warehouseId`.
5. Nunca usar o nome do artigo como chave primária.
6. Correções financeiras devem gerar histórico; evitar apagar movimentos contabilisticamente relevantes.
7. Quantidades e preços negativos são inválidos.
8. Valores monetários são tratados em EUR e arredondados a cêntimos.

## Estado atual

A aplicação ainda contém compatibilidade com o modelo antigo (`matriz`, nomes e documento principal único). A camada `enterprise-data-model.js` permite fazer a migração progressiva sem quebrar os dados existentes.

`enterprise-migration.js` é deliberadamente **opt-in**: não altera a base de dados automaticamente.

## Próxima migração técnica

1. Criar autenticação real com Firebase Authentication.
2. Separar permissões por perfil e armazém através de Custom Claims + Firestore Rules.
3. Migrar movimentos financeiros e de stock para coleções próprias.
4. Ativar auditoria imutável.
5. Só depois remover os campos legacy.
