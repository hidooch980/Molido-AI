CREATE TABLE subscriptions (
    id BIGSERIAL PRIMARY KEY,

    uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),

    company_id BIGINT NOT NULL,

    module_code VARCHAR(100) NOT NULL,

    plan_name VARCHAR(100) NOT NULL,

    status VARCHAR(30) NOT NULL DEFAULT 'active',

    start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    end_date TIMESTAMPTZ NOT NULL,

    auto_renew BOOLEAN NOT NULL DEFAULT TRUE,

    amount DECIMAL(18,2) NOT NULL DEFAULT 0,

    currency VARCHAR(10) NOT NULL DEFAULT 'IRR',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,

    created_by BIGINT,
    updated_by BIGINT,
    deleted_by BIGINT,

    CONSTRAINT fk_subscription_company
        FOREIGN KEY (company_id)
        REFERENCES companies(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

CREATE INDEX idx_subscription_company
ON subscriptions(company_id);

CREATE INDEX idx_subscription_module
ON subscriptions(module_code);

CREATE INDEX idx_subscription_status
ON subscriptions(status);
