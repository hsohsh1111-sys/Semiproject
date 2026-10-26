-- TiDB Cloud (MySQL compatible). Review with the team before applying.
CREATE TABLE IF NOT EXISTS users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  email VARCHAR(255) NOT NULL UNIQUE,
  display_name VARCHAR(80) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id BIGINT PRIMARY KEY,
  style_preference VARCHAR(80),
  favorite_color VARCHAR(32),
  fit_preference VARCHAR(80),
  height_cm SMALLINT,
  body_shape VARCHAR(80),
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_profile_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS products (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  brand VARCHAR(120),
  product_name VARCHAR(255) NOT NULL,
  model_number VARCHAR(120),
  category VARCHAR(80),
  color VARCHAR(80),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX ix_products_model_number (model_number)
);

CREATE TABLE IF NOT EXISTS product_offers (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  product_id BIGINT NOT NULL,
  seller_name VARCHAR(160) NOT NULL,
  product_url VARCHAR(1200) NOT NULL,
  option_label VARCHAR(255),
  current_price_krw INT,
  last_checked_at TIMESTAMP NULL,
  CONSTRAINT fk_offer_product FOREIGN KEY (product_id) REFERENCES products(id),
  INDEX ix_offers_product_price (product_id, current_price_krw)
);

CREATE TABLE IF NOT EXISTS price_histories (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  offer_id BIGINT NOT NULL,
  observed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  price_krw INT NOT NULL,
  source_status VARCHAR(32) NOT NULL DEFAULT 'verified',
  CONSTRAINT fk_history_offer FOREIGN KEY (offer_id) REFERENCES product_offers(id),
  INDEX ix_history_offer_time (offer_id, observed_at)
);

CREATE TABLE IF NOT EXISTS wardrobe_items (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  product_id BIGINT,
  item_name VARCHAR(255) NOT NULL,
  item_type VARCHAR(80),
  is_owned BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_wardrobe_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_wardrobe_product FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS outfits (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  title VARCHAR(180) NOT NULL,
  match_score DECIMAL(5,2),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_outfit_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS outfit_items (
  outfit_id BIGINT NOT NULL,
  product_id BIGINT NOT NULL,
  PRIMARY KEY (outfit_id, product_id),
  CONSTRAINT fk_outfit_item_outfit FOREIGN KEY (outfit_id) REFERENCES outfits(id),
  CONSTRAINT fk_outfit_item_product FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS crawl_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  source_name VARCHAR(160) NOT NULL,
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMP NULL,
  status VARCHAR(32) NOT NULL,
  items_seen INT NOT NULL DEFAULT 0,
  error_summary TEXT
);
