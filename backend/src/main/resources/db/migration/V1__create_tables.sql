-- 排他制約で「=」と「重なり」を一緒に使うために必要
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE employee (
    id   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name varchar(30) NOT NULL UNIQUE,
    CONSTRAINT employee_name_length CHECK (char_length(name) BETWEEN 1 AND 30)
);

CREATE TABLE room (
    id       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name     varchar(30) NOT NULL UNIQUE,
    capacity integer NOT NULL,
    CONSTRAINT room_capacity_positive CHECK (capacity >= 1)
);

CREATE TABLE reservation (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    room_id     bigint NOT NULL REFERENCES room (id) ON DELETE RESTRICT,
    employee_id bigint NOT NULL REFERENCES employee (id) ON DELETE RESTRICT,
    start_at    timestamptz NOT NULL,
    end_at      timestamptz NOT NULL,
    purpose     varchar(50),
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT reservation_start_before_end CHECK (start_at < end_at),
    -- 日本時間は +9 時間ちょうどなので、分は世界のどこから見ても同じ（30 分刻み・秒は 0）
    CONSTRAINT reservation_half_hour CHECK (
        extract(minute FROM start_at) IN (0, 30) AND extract(second FROM start_at) = 0
        AND extract(minute FROM end_at) IN (0, 30) AND extract(second FROM end_at) = 0
    ),
    CONSTRAINT reservation_purpose_length CHECK (purpose IS NULL OR (char_length(purpose) BETWEEN 1 AND 50)),
    -- 同じ会議室で、時間帯が重なる予約は作れない（'[)' = 開始を含み終了を含まない。隣り合う予約は OK）
    CONSTRAINT no_overlap EXCLUDE USING gist (
        room_id WITH =,
        tstzrange(start_at, end_at, '[)') WITH &&
    )
);

-- 「自分の予約」を早く探すための索引
CREATE INDEX reservation_employee_start_idx ON reservation (employee_id, start_at);
