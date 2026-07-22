CREATE TABLE licenses (
    id BIGSERIAL PRIMARY KEY,

    uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),

    company_id BIGINT NOT NULL,

    license_key VARCHAR(255) NOT NULL UNIQUE,

    plan_name VARCHAR(100) NOT NULL,

    status VARCHAR(30) NOT NULL DEFAULT 'trial',

    activated_at TIMESTAMPTZ,

    expires_at TIMESTAMPTZ NOT NULL,

    max_users INTEGER NOT NULL DEFAULT 5,

    max_branches INTEGER NOT NULL DEFAULT 1,

    is_online BOOLEAN NOT NULL DEFAULT TRUE,

    last_validation_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,

    created_by BIGINT,
    updated_by BIGINT,
    deleted_by BIGINT,

    CONSTRAINT fk_license_company
        FOREIGN KEY (company_id)
        REFERENCES companies(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

CREATE INDEX idx_license_company
ON licenses(company_id);

CREATE INDEX idx_license_status
ON licenses(status);

CREATE INDEX idx_license_expire
ON licenses(expires_at);
