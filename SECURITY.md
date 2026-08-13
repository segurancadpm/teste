# Segurança

## Estado atual

A aplicação atual é uma SPA pública e contém compatibilidade com autenticação por PIN no frontend. Esses PINs **não devem ser considerados segredos**: qualquer pessoa com acesso ao JavaScript publicado pode inspecioná-los.

A configuração Firebase (`apiKey`, `projectId`, etc.) também é visível no frontend por desenho do Firebase. O controlo de segurança real deve estar nas regras Firestore/Authentication, não na ocultação da configuração.

## Medidas aplicadas nesta versão

- Content Security Policy base no `index.html`.
- `frame-ancestors 'none'` para reduzir clickjacking.
- `object-src 'none'`.
- Referrer Policy restritiva.
- Validação automática de JavaScript e referências locais em CI.
- Testes unitários da camada de dados.
- Monitor de integridade de dados em modo apenas leitura.
- Migração de dados explicitamente opt-in.

## Obrigatório antes de produção

1. Ativar Firebase Authentication.
2. Remover os PINs hardcoded de `app.js`.
3. Criar Custom Claims para `SuperAdmin` e `Operador Local`.
4. Aplicar Firestore Security Rules por utilizador, perfil e armazém.
5. Separar leitura/escrita de catálogo, stock, compras, entregas e auditoria.
6. Impedir que o cliente altere diretamente campos de auditoria ou permissões.
7. Ativar App Check quando a arquitetura de produção estiver estabilizada.
8. Rever e restringir domínios autorizados no Firebase Authentication.

## Regra sénior

**Nunca confiar no frontend para autorização.** O frontend melhora a experiência; o Firestore deve impedir tecnicamente uma operação não autorizada.
