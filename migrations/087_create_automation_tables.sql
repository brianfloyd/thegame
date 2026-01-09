-- Migration: 087_create_automation_tables.sql
-- Create tables for automation programs, steps, and conditions

-- Table: automation_programs
-- Purpose: Store player-authored automation programs
CREATE TABLE IF NOT EXISTS automation_programs (
    id SERIAL PRIMARY KEY,
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    execution_state JSONB DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for automation_programs
CREATE INDEX IF NOT EXISTS idx_automation_programs_player_id ON automation_programs(player_id);
CREATE INDEX IF NOT EXISTS idx_automation_programs_active ON automation_programs(player_id, is_active) WHERE is_active = TRUE;

-- Table: automation_steps
-- Purpose: Ordered steps within a program
CREATE TABLE IF NOT EXISTS automation_steps (
    id SERIAL PRIMARY KEY,
    program_id INTEGER NOT NULL REFERENCES automation_programs(id) ON DELETE CASCADE,
    step_order INTEGER NOT NULL,
    instruction_type TEXT NOT NULL CHECK (instruction_type IN ('harvest', 'auto_harvest', 'attune', 'deliver', 'wait', 'loop', 'loop_custom', 'collect', 'store', 'move', 'factory_insert_item', 'factory_insert_rune', 'factory_start', 'factory_repeat', 'factory_store_output')),
    instruction_config JSONB NOT NULL DEFAULT '{}',
    conditions JSONB DEFAULT '[]',
    loop_target_step INTEGER,
    loop_max_iterations INTEGER,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_program_step_order UNIQUE(program_id, step_order),
    CONSTRAINT check_step_order_positive CHECK(step_order > 0),
    CONSTRAINT check_loop_iterations_positive CHECK(loop_max_iterations IS NULL OR loop_max_iterations > 0)
);

-- Index for automation_steps
CREATE INDEX IF NOT EXISTS idx_automation_steps_program_id ON automation_steps(program_id, step_order);

-- Table: automation_conditions
-- Purpose: Condition definitions for steps
CREATE TABLE IF NOT EXISTS automation_conditions (
    id SERIAL PRIMARY KEY,
    step_id INTEGER NOT NULL REFERENCES automation_steps(id) ON DELETE CASCADE,
    condition_type TEXT NOT NULL CHECK (condition_type IN ('until', 'while', 'if')),
    condition_target TEXT NOT NULL,
    operator TEXT NOT NULL CHECK (operator IN ('>=', '<=', '==', '!=', '>', '<')),
    threshold_value INTEGER NOT NULL,
    threshold_min INTEGER,
    threshold_max INTEGER,
    item_name TEXT,
    variable_name TEXT
);

-- Index for automation_conditions
CREATE INDEX IF NOT EXISTS idx_automation_conditions_step_id ON automation_conditions(step_id);








