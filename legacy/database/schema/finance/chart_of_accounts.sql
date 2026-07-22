CREATE TABLE chart_of_accounts (
    id BIGSERIAL PRIMARY KEY,

    uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),

    company_id BIGINT NOT NULL,

    parent_id BIGINT,

    account_code VARCHAR(30) NOT NULL,

    account_name VARCHAR(255) NOT NULL,

    account_type VARCHAR(30) NOT NULL,

    account_level SMALLINT NOT NULL,

    is_control_account BOOLEAN NOT NULL DEFAULT FALSE,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    description TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,

    created_by BIGINT,
    updated_by BIGINT,
    deleted_by BIGINT,

    CONSTRAINT fk_coa_company
        FOREIGN KEY (company_id)
        REFERENCES companies(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    CONSTRAINT fk_coa_parent
        FOREIGN KEY (parent_id)
        REFERENCES chart_of_accounts(id)
        ON UPDATE CASCADE
        ON DELETE SET NULL
);

CREATE INDEX idx_coa_company
ON chart_of_accounts(company_id);

CREATE INDEX idx_coa_code
ON chart_of_accounts(account_code);

CREATE INDEX idx_coa_parent
ON chart_of_accounts(parent_id);
