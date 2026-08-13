# Política de compatibilidade e proteção de dados

## Objetivo

O `teste` é uma segunda aplicação sobre o Firebase já utilizado por outro software DPM. O software existente e os dados existentes são tratados como dependências críticas.

## Regras obrigatórias

1. Nunca apagar `appdata/dpm_epi_data_v1` automaticamente.
2. Nunca apagar ou renomear `deliveries` automaticamente.
3. Nunca substituir a estrutura atual de `matriz`, `trabalhadores`, `stocks`, `eventos`, `operadores`, `warehouses` ou `budget` sem compatibilidade explícita.
4. Nenhuma migração deve correr no arranque da aplicação.
5. Novos módulos devem ser aditivos e tolerantes a dados antigos.
6. Operações destrutivas exigem ação explícita do utilizador e confirmação.
7. Antes de uma migração futura, deve existir export/backup verificável.
8. O `teste` deve continuar a conseguir ler os dados atuais mesmo que as novas coleções estejam vazias.
9. O software existente não pode depender de qualquer nova coleção criada pelo `teste`.
10. Uma falha numa funcionalidade nova não pode impedir o carregamento do núcleo EPI.

## Estratégia de evolução

Dados atuais:

- `appdata/dpm_epi_data_v1`
- `deliveries`

Novos módulos podem usar coleções adicionais, por exemplo `purchases`, `suppliers` e `audit`, mas estas são complementares. O documento principal continua a ser preservado.

## Compatibilidade de escrita

Quando o `teste` escrever dados partilhados, deve manter os campos antigos. Campos novos devem ser opcionais. Não se deve alterar silenciosamente o significado de um campo existente.

## Segurança

A autenticação por PIN atualmente existente no frontend não deve ser considerada uma barreira de segurança. A migração para Firebase Authentication + Firestore Rules deve ser feita como uma fase separada, sem alterar o modelo funcional antes de validar a compatibilidade.

## Critério de aceitação

Uma alteração só pode ser considerada pronta se:

- os dados antigos continuam legíveis;
- o software existente continua a poder usar o mesmo Firebase;
- não existem deletes/migrations automáticas;
- o `teste` funciona com as novas coleções vazias;
- o rollback pode ser feito sem perda de dados.
