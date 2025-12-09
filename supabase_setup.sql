-- ============================================================================
--  RODOVAR & AXD - SISTEMA DE LOGÍSTICA (SETUP PROFISSIONAL)
-- ============================================================================

-- 1. LIMPEZA DE AMBIENTE (Opcional - Remove tabelas antigas se existirem)
-- Remova os comentários (--) das linhas abaixo apenas se quiser RESETAR o banco.
-- DROP TABLE IF EXISTS shipments;
-- DROP TABLE IF EXISTS drivers;
-- DROP TABLE IF EXISTS users;

-- ============================================================================
-- 2. CRIAÇÃO DAS TABELAS (ESTRUTURA JSONB FLEXÍVEL)
-- ============================================================================
-- Utilizamos JSONB na coluna 'data' para garantir compatibilidade total com
-- os objetos complexos do TypeScript (Arrays de rotas, Fotos Base64, Logs, etc).

--  TABELA DE CARGAS (SHIPMENTS)
-- Suporta: Rastreamento, Canhoto Digital, Histórico, Roteirizador Multi-paradas
CREATE TABLE IF NOT EXISTS shipments (
    code TEXT PRIMARY KEY,       -- Identificador (Ex: RODOVAR2207)
    data JSONB NOT NULL,         -- Objeto TrackingData completo
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

--  TABELA DE MOTORISTAS (DRIVERS)
-- Suporta: Foto de Perfil, Quilometragem, Placa, Telefone
CREATE TABLE IF NOT EXISTS drivers (
    id TEXT PRIMARY KEY,         -- ID único (Timestamp ou UUID gerado pelo app)
    data JSONB NOT NULL,         -- Objeto Driver completo
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

--  TABELA DE USUÁRIOS E CONFIGURAÇÕES (USERS)
-- Suporta: Login Admin, Senhas, Permissões (Master/Basic) e Cores do Tema
CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY,   -- Username (ex: 'admin') ou 'GLOBAL_SETTINGS'
    data JSONB NOT NULL,         -- Dados do usuário ou Configurações visuais
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================================
-- 3. SEGURANÇA E PERMISSÕES (RLS - ROW LEVEL SECURITY)
-- ============================================================================
-- Configuração essencial para permitir que o Frontend (App) leia e grave dados
-- utilizando a chave pública (ANON KEY) do Supabase.

-- Habilitar RLS nas tabelas
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Criar Políticas de Acesso (Liberar leitura/escrita para a aplicação)
-- Como o controle de acesso (Login) é feito no código React, liberamos o banco para a API.

-- Políticas para CARGAS
CREATE POLICY "App Access Shipments" ON shipments
FOR ALL USING (true) WITH CHECK (true);

-- Políticas para MOTORISTAS
CREATE POLICY "App Access Drivers" ON drivers
FOR ALL USING (true) WITH CHECK (true);

-- Políticas para USUÁRIOS/CONFIGS
CREATE POLICY "App Access Users" ON users
FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- 4. DADOS INICIAIS (SEED DATA)
-- ============================================================================

--  USUÁRIO ADMIN MASTER
-- Login: admin
-- Senha: admin
-- Nível: MASTER (Acesso total a senhas, financeiro e configurações)
INSERT INTO users (username, data)
VALUES (
    'admin',
    '{
        "username": "admin",
        "password": "admin",
        "role": "MASTER"
    }'::jsonb
)
ON CONFLICT (username) DO UPDATE 
SET data = EXCLUDED.data;

--  CONFIGURAÇÕES GLOBAIS DA EMPRESA (TEMA PADRÃO)
-- Define as cores iniciais, nome e slogan para quando o app abrir pela 1ª vez.
INSERT INTO users (username, data)
VALUES (
    'GLOBAL_SETTINGS',
    '{
        "name": "RODOVAR",
        "slogan": "Logística Inteligente",
        "logoUrl": "",
        "primaryColor": "#FFD700",
        "backgroundColor": "#121212",
        "cardColor": "#1E1E1E",
        "textColor": "#F5F5F5"
    }'::jsonb
)
ON CONFLICT (username) DO NOTHING;

-- ============================================================================
-- FIM DO SCRIPT
-- Clique em "RUN" para executar.
-- ============================================================================
