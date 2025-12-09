-- ============================================================================
--  SISTEMA DE LOGÍSTICA RODOVAR & AXD - CONFIGURAÇÃO DO BANCO DE DADOS
-- ============================================================================

--  ZONA DE PERIGO: LIMPEZA TOTAL (Opcional)
-- Remova os dois traços (--) do início das linhas abaixo APENAS se quiser apagar tudo e recomeçar do zero.
-- DROP TABLE IF EXISTS shipments;
-- DROP TABLE IF EXISTS drivers;
-- DROP TABLE IF EXISTS users;

-- ============================================================================
-- 1. CRIAÇÃO DAS TABELAS (ESTRUTURA INTELIGENTE JSONB)
-- ============================================================================

-- Tabela: CARGAS (Shipments)
-- Armazena dados de rastreamento, rotas otimizadas, canhoto digital e status.
CREATE TABLE IF NOT EXISTS shipments (
    code TEXT PRIMARY KEY,       -- Código Único (ex: RODOVAR2207, AXD9988)
    data JSONB NOT NULL,         -- Dados completos (Status, Localização, Fotos, Assinaturas)
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tabela: MOTORISTAS (Drivers)
-- Armazena perfil, foto (base64), placa do veículo e controle de manutenção.
CREATE TABLE IF NOT EXISTS drivers (
    id TEXT PRIMARY KEY,         -- ID do motorista
    data JSONB NOT NULL,         -- Dados (Nome, Fone, Foto, Km Atual, Próx Revisão)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tabela: USUÁRIOS E SISTEMA (Users)
-- Armazena logins administrativos E as configurações globais do aplicativo.
CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY,   -- 'admin', 'joao' ou 'GLOBAL_SETTINGS'
    data JSONB NOT NULL,         -- Senha, Permissões (Master/Basic) ou Cores do Tema
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================================
-- 2. SEGURANÇA E PERMISSÕES (RLS - ROW LEVEL SECURITY)
-- ============================================================================
-- Configuração crítica para permitir que o aplicativo (Frontend) leia e grave dados
-- utilizando a conexão padrão.

-- Habilitar segurança nas tabelas
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

--  LIBERAÇÃO DE ACESSO PARA O APP
-- Estas políticas permitem que o sistema funcione sem bloqueios de permissão do banco,
-- delegando o controle de segurança (Login/Senha) para a lógica do Aplicativo.

-- Política para Cargas (Leitura e Escrita Total)
DROP POLICY IF EXISTS "App Access Shipments" ON shipments;
CREATE POLICY "App Access Shipments" ON shipments
FOR ALL USING (true) WITH CHECK (true);

-- Política para Motoristas (Leitura e Escrita Total)
DROP POLICY IF EXISTS "App Access Drivers" ON drivers;
CREATE POLICY "App Access Drivers" ON drivers
FOR ALL USING (true) WITH CHECK (true);

-- Política para Usuários/Configs (Leitura e Escrita Total)
DROP POLICY IF EXISTS "App Access Users" ON users;
CREATE POLICY "App Access Users" ON users
FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- 3. DADOS PADRÃO DO SISTEMA (SEED DATA)
-- ============================================================================

--  CRIAR ADMIN MASTER PADRÃO
-- Usuário: admin
-- Senha: admin
-- Permissão: MASTER (Acesso total a senhas, motoristas e configurações)
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

--  CRIAR CONFIGURAÇÕES GLOBAIS INICIAIS
-- Define a identidade visual padrão (Preto e Dourado)
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
--  FIM DO SCRIPT
-- Clique no botão "RUN" (Verde) para executar.
-- ============================================================================
