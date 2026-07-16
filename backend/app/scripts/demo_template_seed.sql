-- Demo template dataset. Seeds all per-user financial rows for the frozen demo TEMPLATE user.
-- Generated from the validated bohdankf1 dataset; user id set to the template id.
-- Executed by app/scripts/seed_demo_template.py (which owns the transaction and wipes first).

DO $seed$
DECLARE
  u uuid := '00000000-0000-0000-0000-0000000000d2';  -- demo template user
  -- savings account vars
  a_mono_black uuid; a_priv_uah uuid; a_fop_uah uuid; a_sense_uah uuid; a_osch_uah uuid; a_pumb_uah uuid; a_cash_uah uuid;
  a_mono_usd uuid; a_fop_usd uuid; a_priv_usd uuid; a_wise_usd uuid; a_ibkr_usd uuid; a_cash_usd uuid; a_binance uuid;
  a_mono_eur uuid; a_wise_eur uuid; a_fop_eur uuid; a_bunq_eur uuid; a_revolut_eur uuid; a_cash_eur uuid;
  -- income source vars
  s_solvd uuid; s_reef uuid; s_rent uuid;
  -- goal vars
  g_emerg uuid; g_apt uuid; g_car uuid; g_japan uuid; g_port uuid;
  -- debt vars
  d_oleksii uuid; d_andrii uuid; d_landlord uuid; d_maria uuid;
  -- tax vars
  t_single uuid; t_mil uuid; t_esv uuid; t_pdfo uuid;
BEGIN


  -------------------------------------------------------------------
  -- 1) SAVINGS ACCOUNTS (20)
  -------------------------------------------------------------------
  a_mono_black := gen_random_uuid();
  INSERT INTO savings_accounts (id,user_id,name,account_type,institution,account_number_last4,current_balance,currency,is_active,notes,interest_frequency,interest_accrual_method,accrued_interest,created_at,updated_at)
  VALUES (a_mono_black,u,'Monobank Чорна картка','personal','Monobank','4441',185300.55,'UAH',true,'Mastercard','monthly','compound',0,now(),now());
  a_priv_uah := gen_random_uuid();
  INSERT INTO savings_accounts (id,user_id,name,account_type,institution,account_number_last4,current_balance,currency,is_active,notes,interest_frequency,interest_accrual_method,accrued_interest,created_at,updated_at)
  VALUES (a_priv_uah,u,'PrivatBank Універсальна','personal','PrivatBank','1123',420750.00,'UAH',true,'VISA','monthly','compound',0,now(),now());
  a_fop_uah := gen_random_uuid();
  INSERT INTO savings_accounts (id,user_id,name,account_type,institution,account_number_last4,current_balance,currency,is_active,notes,interest_frequency,interest_accrual_method,accrued_interest,created_at,updated_at)
  VALUES (a_fop_uah,u,'FOP Monobank Гривня','personal','Monobank','7788',512000.00,'UAH',true,'FOP account','monthly','compound',0,now(),now());
  a_sense_uah := gen_random_uuid();
  INSERT INTO savings_accounts (id,user_id,name,account_type,institution,account_number_last4,current_balance,currency,is_active,notes,interest_rate,interest_frequency,interest_accrual_method,accrued_interest,created_at,updated_at)
  VALUES (a_sense_uah,u,'Sense Bank Депозит','fixed_deposit','Sense Bank','3390',96400.25,'UAH',true,'Term deposit 12%',0.1250,'monthly','compound',0,now(),now());
  a_osch_uah := gen_random_uuid();
  INSERT INTO savings_accounts (id,user_id,name,account_type,institution,account_number_last4,current_balance,currency,is_active,notes,interest_frequency,interest_accrual_method,accrued_interest,created_at,updated_at)
  VALUES (a_osch_uah,u,'Oschadbank Картка','personal','Oschadbank','5567',42880.10,'UAH',true,'VISA','monthly','compound',0,now(),now());
  a_pumb_uah := gen_random_uuid();
  INSERT INTO savings_accounts (id,user_id,name,account_type,institution,account_number_last4,current_balance,currency,is_active,notes,interest_frequency,interest_accrual_method,accrued_interest,created_at,updated_at)
  VALUES (a_pumb_uah,u,'Pumb всеКАРТА','personal','Pumb','6612',18230.40,'UAH',true,'Mastercard','monthly','compound',0,now(),now());
  a_cash_uah := gen_random_uuid();
  INSERT INTO savings_accounts (id,user_id,name,account_type,current_balance,currency,is_active,notes,interest_frequency,interest_accrual_method,accrued_interest,created_at,updated_at)
  VALUES (a_cash_uah,u,'Готівка UAH','cash',55000.00,'UAH',true,'Cash','monthly','compound',0,now(),now());

  a_mono_usd := gen_random_uuid();
  INSERT INTO savings_accounts (id,user_id,name,account_type,institution,account_number_last4,current_balance,currency,is_active,notes,interest_frequency,interest_accrual_method,accrued_interest,created_at,updated_at)
  VALUES (a_mono_usd,u,'Monobank Доларова','personal','Monobank','9012',12450.00,'USD',true,'Mastercard','monthly','compound',0,now(),now());
  a_fop_usd := gen_random_uuid();
  INSERT INTO savings_accounts (id,user_id,name,account_type,institution,account_number_last4,current_balance,currency,is_active,notes,interest_frequency,interest_accrual_method,accrued_interest,created_at,updated_at)
  VALUES (a_fop_usd,u,'FOP Monobank Долар','personal','Monobank','7789',34300.00,'USD',true,'FOP account','monthly','compound',0,now(),now());
  a_priv_usd := gen_random_uuid();
  INSERT INTO savings_accounts (id,user_id,name,account_type,institution,account_number_last4,current_balance,currency,is_active,notes,interest_frequency,interest_accrual_method,accrued_interest,created_at,updated_at)
  VALUES (a_priv_usd,u,'PrivatBank USD','personal','PrivatBank','1124',6120.40,'USD',true,'VISA','monthly','compound',0,now(),now());
  a_wise_usd := gen_random_uuid();
  INSERT INTO savings_accounts (id,user_id,name,account_type,institution,account_number_last4,current_balance,currency,is_active,notes,interest_frequency,interest_accrual_method,accrued_interest,created_at,updated_at)
  VALUES (a_wise_usd,u,'Wise USD','personal','Wise','2201',21600.00,'USD',true,'Multi-currency','monthly','compound',0,now(),now());
  a_ibkr_usd := gen_random_uuid();
  INSERT INTO savings_accounts (id,user_id,name,account_type,institution,account_number_last4,current_balance,currency,is_active,notes,interest_frequency,interest_accrual_method,accrued_interest,created_at,updated_at)
  VALUES (a_ibkr_usd,u,'Interactive Brokers Cash','business','Interactive Brokers','3388',28900.00,'USD',true,'Brokerage cash','monthly','compound',0,now(),now());
  a_cash_usd := gen_random_uuid();
  INSERT INTO savings_accounts (id,user_id,name,account_type,current_balance,currency,is_active,notes,interest_frequency,interest_accrual_method,accrued_interest,created_at,updated_at)
  VALUES (a_cash_usd,u,'Cash USD','cash',9000.00,'USD',true,'Cash','monthly','compound',0,now(),now());
  a_binance := gen_random_uuid();
  INSERT INTO savings_accounts (id,user_id,name,account_type,institution,current_balance,currency,is_active,notes,interest_frequency,interest_accrual_method,accrued_interest,created_at,updated_at)
  VALUES (a_binance,u,'Binance USDT','crypto','Binance',41000.00,'USD',true,'Stablecoin holdings','monthly','compound',0,now(),now());

  a_mono_eur := gen_random_uuid();
  INSERT INTO savings_accounts (id,user_id,name,account_type,institution,account_number_last4,current_balance,currency,is_active,notes,interest_frequency,interest_accrual_method,accrued_interest,created_at,updated_at)
  VALUES (a_mono_eur,u,'Monobank Єврова','personal','Monobank','9013',8240.75,'EUR',true,'Mastercard','monthly','compound',0,now(),now());
  a_wise_eur := gen_random_uuid();
  INSERT INTO savings_accounts (id,user_id,name,account_type,institution,account_number_last4,current_balance,currency,is_active,notes,interest_frequency,interest_accrual_method,accrued_interest,created_at,updated_at)
  VALUES (a_wise_eur,u,'Wise EUR','personal','Wise','2202',18800.00,'EUR',true,'Multi-currency','monthly','compound',0,now(),now());
  a_fop_eur := gen_random_uuid();
  INSERT INTO savings_accounts (id,user_id,name,account_type,institution,account_number_last4,current_balance,currency,is_active,notes,interest_frequency,interest_accrual_method,accrued_interest,created_at,updated_at)
  VALUES (a_fop_eur,u,'FOP Monobank Євро','personal','Monobank','7790',14500.00,'EUR',true,'FOP account','monthly','compound',0,now(),now());
  a_bunq_eur := gen_random_uuid();
  INSERT INTO savings_accounts (id,user_id,name,account_type,institution,account_number_last4,current_balance,currency,is_active,notes,interest_frequency,interest_accrual_method,accrued_interest,created_at,updated_at)
  VALUES (a_bunq_eur,u,'Bunq EUR','personal','Bunq','3345',6150.30,'EUR',true,'Mastercard','monthly','compound',0,now(),now());
  a_revolut_eur := gen_random_uuid();
  INSERT INTO savings_accounts (id,user_id,name,account_type,institution,account_number_last4,current_balance,currency,is_active,notes,interest_frequency,interest_accrual_method,accrued_interest,created_at,updated_at)
  VALUES (a_revolut_eur,u,'Revolut EUR','personal','Revolut','4471',9800.00,'EUR',true,'Metal','monthly','compound',0,now(),now());
  a_cash_eur := gen_random_uuid();
  INSERT INTO savings_accounts (id,user_id,name,account_type,current_balance,currency,is_active,notes,interest_frequency,interest_accrual_method,accrued_interest,created_at,updated_at)
  VALUES (a_cash_eur,u,'Cash EUR','cash',5500.00,'EUR',true,'Cash','monthly','compound',0,now(),now());

  -------------------------------------------------------------------
  -- 2) ACCOUNT TRANSACTIONS (10) — recent activity, balances tie out
  -------------------------------------------------------------------
  INSERT INTO account_transactions (id,account_id,user_id,transaction_type,amount,currency,balance_before,balance_after,description,category,transaction_date,status,created_at,updated_at) VALUES
   (gen_random_uuid(),a_fop_usd,u,'deposit',7200.00,'USD',27100.00,34300.00,'Income: Solvd Inc','income',TIMESTAMPTZ '2026-07-05 09:00:00+00','completed',now(),now()),
   (gen_random_uuid(),a_fop_eur,u,'deposit',4200.00,'EUR',10300.00,14500.00,'Income: Reef Technologies','income',TIMESTAMPTZ '2026-07-03 09:00:00+00','completed',now(),now()),
   (gen_random_uuid(),a_priv_uah,u,'deposit',18000.00,'UAH',402750.00,420750.00,'Rental income: Apartment Poznyaky','income',TIMESTAMPTZ '2026-07-01 12:00:00+00','completed',now(),now()),
   (gen_random_uuid(),a_mono_black,u,'withdrawal',1240.50,'UAH',186541.05,185300.55,'Silpo','groceries',TIMESTAMPTZ '2026-07-12 18:30:00+00','completed',now(),now()),
   (gen_random_uuid(),a_wise_usd,u,'withdrawal',289.00,'USD',21889.00,21600.00,'JetBrains License','software',TIMESTAMPTZ '2026-06-15 10:00:00+00','completed',now(),now()),
   (gen_random_uuid(),a_wise_eur,u,'withdrawal',320.00,'EUR',19120.00,18800.00,'Booking hotel Krakow','travel',TIMESTAMPTZ '2026-06-12 14:00:00+00','completed',now(),now()),
   (gen_random_uuid(),a_mono_usd,u,'withdrawal',15.49,'USD',12465.49,12450.00,'Netflix Premium','subscription',TIMESTAMPTZ '2026-07-02 08:00:00+00','completed',now(),now()),
   (gen_random_uuid(),a_mono_eur,u,'withdrawal',5.99,'EUR',8246.74,8240.75,'Oura Membership','subscription',TIMESTAMPTZ '2026-07-14 08:00:00+00','completed',now(),now()),
   (gen_random_uuid(),a_sense_uah,u,'deposit',25000.00,'UAH',71400.25,96400.25,'Transfer to savings','transfer',TIMESTAMPTZ '2026-07-08 11:00:00+00','completed',now(),now()),
   (gen_random_uuid(),a_binance,u,'deposit',5000.00,'USD',36000.00,41000.00,'USDT purchase','investment',TIMESTAMPTZ '2026-07-10 16:00:00+00','completed',now(),now());

  -------------------------------------------------------------------
  -- 3) INCOME SOURCES (3)
  -------------------------------------------------------------------
  s_solvd := gen_random_uuid();
  INSERT INTO income_sources (id,user_id,name,description,category,amount,currency,frequency,is_active,start_date,target_account_id,auto_deposit,created_at,updated_at)
  VALUES (s_solvd,u,'Solvd Inc','Software engineering contract','business',7200.00,'USD','MONTHLY',true,DATE '2026-02-01',a_fop_usd,true,now(),now());
  s_reef := gen_random_uuid();
  INSERT INTO income_sources (id,user_id,name,description,category,amount,currency,frequency,is_active,start_date,target_account_id,auto_deposit,created_at,updated_at)
  VALUES (s_reef,u,'Reef Technologies','Part-time consulting','business',4200.00,'EUR','MONTHLY',true,DATE '2026-03-01',a_fop_eur,true,now(),now());
  s_rent := gen_random_uuid();
  INSERT INTO income_sources (id,user_id,name,description,category,amount,currency,frequency,is_active,start_date,target_account_id,auto_deposit,created_at,updated_at)
  VALUES (s_rent,u,'Rental — Apartment Poznyaky','1-bedroom rental','rental',18000.00,'UAH','MONTHLY',true,DATE '2026-01-01',a_priv_uah,true,now(),now());

  -------------------------------------------------------------------
  -- 4) INCOME TRANSACTIONS (10)
  -------------------------------------------------------------------
  INSERT INTO income_transactions (id,user_id,source_id,description,amount,currency,date,category,status,deposited_to_account_id,created_at,updated_at)
  SELECT gen_random_uuid(), u, x.src, 'Income: '||x.nm, x.amt, x.cur, x.dt, x.cat, 'DEPOSITED', x.acct, now(), now()
  FROM (VALUES
    (s_solvd,'Solvd Inc',7200.00::numeric,'USD','business',TIMESTAMP '2026-04-05',a_fop_usd),
    (s_solvd,'Solvd Inc',7200.00,'USD','business',TIMESTAMP '2026-05-05',a_fop_usd),
    (s_solvd,'Solvd Inc',7200.00,'USD','business',TIMESTAMP '2026-06-05',a_fop_usd),
    (s_solvd,'Solvd Inc',7200.00,'USD','business',TIMESTAMP '2026-07-05',a_fop_usd),
    (s_reef,'Reef Technologies',4200.00,'EUR','business',TIMESTAMP '2026-05-03',a_fop_eur),
    (s_reef,'Reef Technologies',4200.00,'EUR','business',TIMESTAMP '2026-06-03',a_fop_eur),
    (s_reef,'Reef Technologies',4200.00,'EUR','business',TIMESTAMP '2026-07-03',a_fop_eur),
    (s_rent,'Apartment Poznyaky',18000.00,'UAH','rental',TIMESTAMP '2026-05-01',a_priv_uah),
    (s_rent,'Apartment Poznyaky',18000.00,'UAH','rental',TIMESTAMP '2026-06-01',a_priv_uah),
    (s_rent,'Apartment Poznyaky',18000.00,'UAH','rental',TIMESTAMP '2026-07-01',a_priv_uah)
  ) AS x(src,nm,amt,cur,cat,dt,acct);

  -------------------------------------------------------------------
  -- 5) EXPENSES (55)
  -------------------------------------------------------------------
  INSERT INTO expenses (id,user_id,name,category,amount,currency,frequency,date,is_active,status,paid_date,paid_amount,payment_account_id,payment_method,auto_pay,monthly_equivalent,created_at,updated_at)
  SELECT gen_random_uuid(), u, x.nm, x.cat, x.amt, x.cur, x.freq::expensefrequency, x.dt, true,
         x.st,
         CASE WHEN x.st='paid' THEN x.dt END,
         CASE WHEN x.st='paid' THEN x.amt END,
         CASE x.cur WHEN 'UAH' THEN a_mono_black WHEN 'USD' THEN a_wise_usd WHEN 'EUR' THEN a_wise_eur END,
         'card', false, x.me::numeric, now(), now()
  FROM (VALUES
    ('Сільпо','groceries',1240.50::numeric,'UAH','ONE_TIME',TIMESTAMP '2026-07-12','paid',NULL::numeric),
    ('АТБ','groceries',680.20,'UAH','ONE_TIME',TIMESTAMP '2026-07-11','paid',NULL),
    ('Novus','groceries',1580.00,'UAH','ONE_TIME',TIMESTAMP '2026-07-09','paid',NULL),
    ('Метро Cash and Carry','groceries',3120.75,'UAH','ONE_TIME',TIMESTAMP '2026-07-06','paid',NULL),
    ('Сільпо','groceries',940.30,'UAH','ONE_TIME',TIMESTAMP '2026-07-03','paid',NULL),
    ('Varus','groceries',720.10,'UAH','ONE_TIME',TIMESTAMP '2026-06-29','paid',NULL),
    ('АТБ','groceries',560.00,'UAH','ONE_TIME',TIMESTAMP '2026-06-25','paid',NULL),
    ('Fora','groceries',430.90,'UAH','ONE_TIME',TIMESTAMP '2026-06-22','paid',NULL),
    ('Auchan','groceries',2100.00,'UAH','ONE_TIME',TIMESTAMP '2026-07-13','overdue',NULL),
    ('Сільпо','groceries',760.00,'UAH','ONE_TIME',TIMESTAMP '2026-07-14','overdue',NULL),
    ('Пузата Хата','diningOut',385.00,'UAH','ONE_TIME',TIMESTAMP '2026-07-10','paid',NULL),
    ('Mafia','diningOut',1250.00,'UAH','ONE_TIME',TIMESTAMP '2026-07-05','paid',NULL),
    ('Starbucks','diningOut',210.00,'UAH','ONE_TIME',TIMESTAMP '2026-07-08','paid',NULL),
    ('McDonalds','diningOut',320.50,'UAH','ONE_TIME',TIMESTAMP '2026-07-02','paid',NULL),
    ('Sushi Master','diningOut',890.00,'UAH','ONE_TIME',TIMESTAMP '2026-06-28','paid',NULL),
    ('Aroma Kava','diningOut',145.00,'UAH','ONE_TIME',TIMESTAMP '2026-06-24','paid',NULL),
    ('BEEF meat and wine','diningOut',2400.00,'UAH','ONE_TIME',TIMESTAMP '2026-06-20','paid',NULL),
    ('Dominos Pizza','diningOut',540.00,'UAH','ONE_TIME',TIMESTAMP '2026-06-30','overdue',NULL),
    ('Планета Кіно','entertainment',560.00,'UAH','ONE_TIME',TIMESTAMP '2026-07-07','paid',NULL),
    ('Steam гра','entertainment',1100.00,'UAH','ONE_TIME',TIMESTAMP '2026-07-04','paid',NULL),
    ('Концерт Океан Ельзи','entertainment',2500.00,'UAH','ONE_TIME',TIMESTAMP '2026-06-30','paid',NULL),
    ('Боулінг','entertainment',640.00,'UAH','ONE_TIME',TIMESTAMP '2026-06-21','paid',NULL),
    ('Uklon','transportation',180.00,'UAH','ONE_TIME',TIMESTAMP '2026-07-12','paid',NULL),
    ('Bolt','transportation',240.50,'UAH','ONE_TIME',TIMESTAMP '2026-07-10','paid',NULL),
    ('WOG паливо','transportation',2200.00,'UAH','ONE_TIME',TIMESTAMP '2026-07-08','paid',NULL),
    ('Метро проїзд','transportation',160.00,'UAH','ONE_TIME',TIMESTAMP '2026-07-01','paid',NULL),
    ('OKKO паливо','transportation',1900.00,'UAH','ONE_TIME',TIMESTAMP '2026-06-26','paid',NULL),
    ('Bolt','transportation',300.00,'UAH','ONE_TIME',TIMESTAMP '2026-07-14','overdue',NULL),
    ('Zara','clothing',3200.00,'UAH','ONE_TIME',TIMESTAMP '2026-07-05','paid',NULL),
    ('Nike','clothing',4500.00,'UAH','ONE_TIME',TIMESTAMP '2026-06-27','paid',NULL),
    ('Intertop взуття','clothing',2800.00,'UAH','ONE_TIME',TIMESTAMP '2026-06-19','paid',NULL),
    ('Барбершоп OldBoy','personalCare',500.00,'UAH','ONE_TIME',TIMESTAMP '2026-07-06','paid',NULL),
    ('Аптека АНЦ','personalCare',340.20,'UAH','ONE_TIME',TIMESTAMP '2026-07-02','paid',NULL),
    ('Манікюр','personalCare',450.00,'UAH','ONE_TIME',TIMESTAMP '2026-06-23','paid',NULL),
    ('Комуналка ЖЕК','utilities',3800.00,'UAH','MONTHLY',TIMESTAMP '2026-07-05','paid',3800.00),
    ('Київстар Home інтернет','utilities',320.00,'UAH','MONTHLY',TIMESTAMP '2026-07-03','paid',320.00),
    ('Електроенергія','utilities',1250.00,'UAH','MONTHLY',TIMESTAMP '2026-07-04','overdue',1250.00),
    ('Оренда квартири','Housing',24000.00,'UAH','MONTHLY',TIMESTAMP '2026-07-01','paid',24000.00),
    ('Стоматологія','Health',5600.00,'UAH','ONE_TIME',TIMESTAMP '2026-06-18','paid',NULL),
    ('Медичний чекап','Health',3200.00,'UAH','ONE_TIME',TIMESTAMP '2026-07-09','overdue',NULL),
    ('JetBrains ліцензія','Software',289.00,'USD','ONE_TIME',TIMESTAMP '2026-06-15','paid',NULL),
    ('GitHub Copilot','Software',100.00,'USD','ONE_TIME',TIMESTAMP '2026-07-01','paid',NULL),
    ('Навушники Sony','Personal Tech',7800.00,'UAH','ONE_TIME',TIMESTAMP '2026-06-16','paid',NULL),
    ('Кабель USB-C','Personal Tech',350.00,'UAH','ONE_TIME',TIMESTAMP '2026-07-02','paid',NULL),
    ('Курс Udemy','Education',45.00,'USD','ONE_TIME',TIMESTAMP '2026-06-20','paid',NULL),
    ('Книги Yakaboo','Education',1200.00,'UAH','ONE_TIME',TIMESTAMP '2026-06-22','paid',NULL),
    ('Booking готель Краків','Travel',320.00,'EUR','ONE_TIME',TIMESTAMP '2026-06-12','paid',NULL),
    ('Ryanair квитки','Travel',189.00,'EUR','ONE_TIME',TIMESTAMP '2026-06-10','paid',NULL),
    ('BlaBlaCar','Travel',25.00,'EUR','ONE_TIME',TIMESTAMP '2026-06-14','paid',NULL),
    ('Подарунок мамі','Gifts',2500.00,'UAH','ONE_TIME',TIMESTAMP '2026-06-17','paid',NULL),
    ('Квіти','Gifts',850.00,'UAH','ONE_TIME',TIMESTAMP '2026-07-07','paid',NULL),
    ('Нова Пошта','miscellaneous',180.00,'UAH','ONE_TIME',TIMESTAMP '2026-07-10','paid',NULL),
    ('Донат ЗСУ','miscellaneous',5000.00,'UAH','ONE_TIME',TIMESTAMP '2026-07-01','paid',NULL),
    ('Паркування','miscellaneous',120.00,'UAH','ONE_TIME',TIMESTAMP '2026-07-05','paid',NULL),
    ('Netflix фільм оренда','entertainment',150.00,'UAH','ONE_TIME',TIMESTAMP '2026-07-13','overdue',NULL)
  ) AS x(nm,cat,amt,cur,freq,dt,st,me);

  -------------------------------------------------------------------
  -- 6) SUBSCRIPTIONS (20) — one paused
  -------------------------------------------------------------------
  INSERT INTO subscriptions (id,user_id,name,description,category,amount,currency,frequency,start_date,is_active,status,payment_account_id,auto_pay,next_payment_date,reminder_days_before,paused_at,resume_date,created_at,updated_at)
  SELECT gen_random_uuid(), u, x.nm, x.descr, x.cat, x.amt, x.cur, x.freq, DATE '2026-01-10',
         (x.st='active'), x.st,
         CASE x.cur WHEN 'UAH' THEN a_mono_black WHEN 'USD' THEN a_mono_usd WHEN 'EUR' THEN a_mono_eur END,
         true, x.nextd, 3,
         CASE WHEN x.st='paused' THEN now() END,
         CASE WHEN x.st='paused' THEN TIMESTAMP '2026-09-01' END,
         now(), now()
  FROM (VALUES
    ('Netflix Premium','4K UHD','Entertainment',15.49::numeric,'USD','monthly',TIMESTAMP '2026-08-02','active'),
    ('Spotify Family','6 accounts','Music',199.00,'UAH','monthly',TIMESTAMP '2026-08-05','active'),
    ('YouTube Premium','Individual','Entertainment',179.00,'UAH','monthly',TIMESTAMP '2026-08-10','active'),
    ('Apple One','Premier bundle','Bundle',34.95,'USD','monthly',TIMESTAMP '2026-08-12','active'),
    ('iCloud+ 2TB','Storage','Storage',9.99,'USD','monthly',TIMESTAMP '2026-08-15','active'),
    ('Claude Max','20x usage','AI',100.00,'USD','monthly',TIMESTAMP '2026-08-01','active'),
    ('ChatGPT Plus','GPT Pro','AI',20.00,'USD','monthly',TIMESTAMP '2026-08-03','active'),
    ('GitHub Copilot','Individual','Developer',10.00,'USD','monthly',TIMESTAMP '2026-08-01','active'),
    ('Notion Plus','Personal','Productivity',8.00,'USD','monthly',TIMESTAMP '2026-08-07','active'),
    ('1Password Families','Family','Security',4.99,'USD','monthly',TIMESTAMP '2026-08-09','active'),
    ('Setanta Sports','Sports streaming','Sports',199.00,'UAH','monthly',TIMESTAMP '2026-08-06','active'),
    ('MEGOGO Максимальна','TV and movies','Entertainment',249.00,'UAH','monthly',TIMESTAMP '2026-08-11','active'),
    ('Kyivstar Mobile','Unlimited','Mobile',500.00,'UAH','monthly',TIMESTAMP '2026-08-04','active'),
    ('Coursera Plus','Annual','Education',399.00,'USD','annually',TIMESTAMP '2027-02-01','active'),
    ('Duolingo Super','Annual','Education',83.99,'USD','annually',TIMESTAMP '2026-12-10','active'),
    ('Amazon Prime','Annual','Shopping',139.00,'USD','annually',TIMESTAMP '2026-11-20','active'),
    ('Adobe Creative Cloud','All apps','Design',59.99,'USD','monthly',TIMESTAMP '2026-08-08','active'),
    ('Figma Professional','Per editor','Design',15.00,'USD','monthly',TIMESTAMP '2026-08-13','active'),
    ('Oura Membership','Ring subscription','Health',5.99,'EUR','monthly',TIMESTAMP '2026-08-14','active'),
    ('Xbox Game Pass Ultimate','Console and PC','Gaming',16.99,'USD','monthly',TIMESTAMP '2026-09-16','paused')
  ) AS x(nm,descr,cat,amt,cur,freq,nextd,st);

  -------------------------------------------------------------------
  -- 7) PORTFOLIO ASSETS (25) — stocks + ETFs + crypto
  -------------------------------------------------------------------
  INSERT INTO portfolio_assets (id,user_id,asset_name,asset_type,symbol,ticker,quantity,purchase_price,current_price,currency,purchase_date,
      total_invested,current_value,total_return,return_percentage,cost_basis,cost_basis_method,use_dynamic_pricing,price_source,is_dividend_paying,total_dividends_received,auto_deposit_dividends,is_active,auto_transact,payment_account_id,created_at,updated_at)
  SELECT gen_random_uuid(), u, x.nm, x.atype, x.tk, x.tk, x.q, x.p, x.c, 'USD', x.pdate,
      x.q*x.p, x.q*x.c, x.q*(x.c-x.p), round((x.c-x.p)/x.p*100,2), x.q*x.p, 'average',
      (x.atype <> 'crypto'), CASE WHEN x.atype='crypto' THEN 'manual' ELSE 'yfinance' END, false, 0, false, true, false,
      CASE WHEN x.atype='crypto' THEN a_binance ELSE a_ibkr_usd END, now(), now()
  FROM (VALUES
    ('Apple Inc','stocks','AAPL',120::numeric,172.40::numeric,236.50::numeric,TIMESTAMP '2024-03-15'),
    ('Microsoft Corporation','stocks','MSFT',60,330.10,512.30,TIMESTAMP '2024-01-20'),
    ('Alphabet Inc Class A','stocks','GOOGL',80,138.20,205.60,TIMESTAMP '2024-05-10'),
    ('Amazon.com Inc','stocks','AMZN',90,130.50,238.90,TIMESTAMP '2023-11-05'),
    ('NVIDIA Corporation','stocks','NVDA',250,78.60,211.80,TIMESTAMP '2023-08-12'),
    ('Tesla Inc','stocks','TSLA',70,240.00,342.15,TIMESTAMP '2024-06-18'),
    ('Meta Platforms Inc','stocks','META',45,320.75,712.40,TIMESTAMP '2023-10-02'),
    ('Advanced Micro Devices','stocks','AMD',100,110.20,168.55,TIMESTAMP '2024-02-14'),
    ('Netflix Inc','stocks','NFLX',20,480.00,1180.20,TIMESTAMP '2023-09-25'),
    ('JPMorgan Chase and Co','stocks','JPM',55,185.30,305.10,TIMESTAMP '2024-04-08'),
    ('Visa Inc','stocks','V',40,245.60,358.20,TIMESTAMP '2024-03-01'),
    ('Costco Wholesale','stocks','COST',15,720.40,1085.60,TIMESTAMP '2024-07-22'),
    ('ASML Holding NV','stocks','ASML',18,650.20,985.40,TIMESTAMP '2024-05-30'),
    ('Taiwan Semiconductor','stocks','TSM',60,145.30,268.75,TIMESTAMP '2024-01-15'),
    ('Berkshire Hathaway B','stocks','BRK.B',25,410.20,512.90,TIMESTAMP '2024-06-05'),
    ('Vanguard S&P 500 ETF','etfs','VOO',110,405.60,691.10,TIMESTAMP '2023-07-10'),
    ('Invesco QQQ Trust','etfs','QQQ',65,430.20,719.71,TIMESTAMP '2023-08-01'),
    ('Vanguard Total Stock Market','etfs','VTI',90,235.40,312.85,TIMESTAMP '2023-12-12'),
    ('Schwab US Dividend Equity','etfs','SCHD',200,74.20,92.30,TIMESTAMP '2024-02-20'),
    ('Vanguard FTSE All-World ex-US','etfs','VXUS',150,58.30,72.10,TIMESTAMP '2024-03-18'),
    ('iShares Core MSCI EM','etfs','IEMG',120,52.40,63.85,TIMESTAMP '2024-04-25'),
    ('Bitcoin','crypto','BTC',1.20,42000.00,98500.00,TIMESTAMP '2023-06-15'),
    ('Ethereum','crypto','ETH',12,2100.00,4250.00,TIMESTAMP '2023-07-20'),
    ('Solana','crypto','SOL',180,95.00,218.40,TIMESTAMP '2024-01-30'),
    ('Cardano','crypto','ADA',8000,0.52,0.94,TIMESTAMP '2024-02-28')
  ) AS x(nm,atype,tk,q,p,c,pdate);

  -------------------------------------------------------------------
  -- 8) GOALS (5)
  -------------------------------------------------------------------
  g_emerg := gen_random_uuid();
  INSERT INTO goals (id,user_id,name,description,category,target_amount,current_amount,currency,monthly_contribution,start_date,target_date,is_active,is_completed,progress_percentage,auto_track_progress,created_at,updated_at)
  VALUES (g_emerg,u,'Emergency Fund','6 months of expenses','safety',600000.00,385000.00,'UAH',25000.00,DATE '2026-01-01',DATE '2026-12-31',true,false,64.17,false,now(),now());
  g_apt := gen_random_uuid();
  INSERT INTO goals (id,user_id,name,description,category,target_amount,current_amount,currency,monthly_contribution,start_date,target_date,is_active,is_completed,progress_percentage,auto_track_progress,created_at,updated_at)
  VALUES (g_apt,u,'Apartment Down Payment','20% down payment','real_estate',60000.00,34300.00,'USD',2000.00,DATE '2026-01-01',DATE '2027-12-31',true,false,57.17,false,now(),now());
  g_car := gen_random_uuid();
  INSERT INTO goals (id,user_id,name,description,category,target_amount,current_amount,currency,monthly_contribution,start_date,target_date,is_active,is_completed,progress_percentage,auto_track_progress,created_at,updated_at)
  VALUES (g_car,u,'New Car (Tesla Model Y)','Electric vehicle','vehicle',55000.00,18900.00,'USD',1500.00,DATE '2026-02-01',DATE '2027-06-30',true,false,34.36,false,now(),now());
  g_japan := gen_random_uuid();
  INSERT INTO goals (id,user_id,name,description,category,target_amount,current_amount,currency,monthly_contribution,start_date,target_date,is_active,is_completed,progress_percentage,auto_track_progress,created_at,updated_at)
  VALUES (g_japan,u,'Vacation to Japan','2 weeks trip','travel',8000.00,6150.00,'EUR',800.00,DATE '2026-03-01',DATE '2026-10-01',true,false,76.88,false,now(),now());
  g_port := gen_random_uuid();
  INSERT INTO goals (id,user_id,name,description,category,target_amount,current_amount,currency,monthly_contribution,start_date,target_date,is_active,is_completed,progress_percentage,auto_track_progress,created_at,updated_at)
  VALUES (g_port,u,'Investment Portfolio to 500k','Long-term wealth','investment',500000.00,360000.00,'USD',5000.00,DATE '2025-06-01',DATE '2028-01-01',true,false,72.00,false,now(),now());

  -------------------------------------------------------------------
  -- 9) GOAL <-> ACCOUNT LINKS (4)
  -------------------------------------------------------------------
  INSERT INTO goal_account_links (id,goal_id,account_id,user_id,allocation_type,created_at,updated_at) VALUES
   (gen_random_uuid(),g_emerg,a_sense_uah,u,'full',now(),now()),
   (gen_random_uuid(),g_apt,a_fop_usd,u,'full',now(),now()),
   (gen_random_uuid(),g_car,a_ibkr_usd,u,'full',now(),now()),
   (gen_random_uuid(),g_japan,a_wise_eur,u,'full',now(),now());

  -------------------------------------------------------------------
  -- 10) DEBTS (4, receivables) + 11) DEBT PAYMENTS (5)
  -------------------------------------------------------------------
  d_oleksii := gen_random_uuid();
  INSERT INTO debts (id,user_id,debtor_name,description,amount,amount_paid,currency,is_paid,due_date,is_active,deposit_account_id,auto_deposit,reminder_days_before,next_payment_date,payment_frequency,expected_payment_amount,accrued_interest,created_at,updated_at)
  VALUES (d_oleksii,u,'Олексій Коваль','Personal loan to a friend',40000.00,15000.00,'UAH',false,DATE '2026-09-30',true,a_mono_black,false,3,DATE '2026-08-01','monthly',5000.00,0,now(),now());
  d_andrii := gen_random_uuid();
  INSERT INTO debts (id,user_id,debtor_name,description,amount,amount_paid,currency,is_paid,paid_date,is_active,deposit_account_id,auto_deposit,reminder_days_before,accrued_interest,created_at,updated_at)
  VALUES (d_andrii,u,'Андрій Мельник','Repaid car-related loan',3000.00,3000.00,'USD',true,DATE '2026-06-20',true,a_mono_usd,false,3,0,now(),now());
  d_landlord := gen_random_uuid();
  INSERT INTO debts (id,user_id,debtor_name,description,amount,amount_paid,currency,is_paid,due_date,is_active,deposit_account_id,auto_deposit,reminder_days_before,accrued_interest,created_at,updated_at)
  VALUES (d_landlord,u,'Landlord deposit refund','Security deposit to be returned',24000.00,0.00,'UAH',false,DATE '2026-08-15',true,a_priv_uah,false,3,0,now(),now());
  d_maria := gen_random_uuid();
  INSERT INTO debts (id,user_id,debtor_name,description,amount,amount_paid,currency,is_paid,due_date,is_active,deposit_account_id,auto_deposit,reminder_days_before,next_payment_date,payment_frequency,expected_payment_amount,accrued_interest,created_at,updated_at)
  VALUES (d_maria,u,'Марія Шевченко','Lent for a trip',700.00,200.00,'EUR',false,DATE '2026-08-31',true,a_wise_eur,false,3,DATE '2026-08-01','monthly',250.00,0,now(),now());

  INSERT INTO debt_payments (id,debt_id,user_id,amount,currency,payment_date,principal_amount,interest_amount,balance_before,balance_after,status,created_at) VALUES
   (gen_random_uuid(),d_oleksii,u,5000.00,'UAH',TIMESTAMP '2026-05-01',5000.00,0,40000.00,35000.00,'completed',now()),
   (gen_random_uuid(),d_oleksii,u,5000.00,'UAH',TIMESTAMP '2026-06-01',5000.00,0,35000.00,30000.00,'completed',now()),
   (gen_random_uuid(),d_oleksii,u,5000.00,'UAH',TIMESTAMP '2026-07-01',5000.00,0,30000.00,25000.00,'completed',now()),
   (gen_random_uuid(),d_andrii,u,3000.00,'USD',TIMESTAMP '2026-06-20',3000.00,0,3000.00,0.00,'completed',now()),
   (gen_random_uuid(),d_maria,u,200.00,'EUR',TIMESTAMP '2026-07-01',200.00,0,700.00,500.00,'completed',now());

  -------------------------------------------------------------------
  -- 12) TAXES (4) + 13) TAX PAYMENTS (5)
  -------------------------------------------------------------------
  t_single := gen_random_uuid();
  INSERT INTO taxes (id,user_id,name,description,tax_type,currency,percentage,is_active,frequency,income_source_id,payment_account_id,auto_pay,next_payment_date,created_at,updated_at)
  VALUES (t_single,u,'Єдиний податок (5%)','FOP group 3 single tax','percentage','UAH',5.0,true,'quarterly',s_rent,a_priv_uah,false,DATE '2026-10-01',now(),now());
  t_mil := gen_random_uuid();
  INSERT INTO taxes (id,user_id,name,description,tax_type,currency,percentage,is_active,frequency,payment_account_id,auto_pay,next_payment_date,created_at,updated_at)
  VALUES (t_mil,u,'Військовий збір (1%)','Military levy on income','percentage','UAH',1.0,true,'monthly',a_mono_black,false,DATE '2026-08-01',now(),now());
  t_esv := gen_random_uuid();
  INSERT INTO taxes (id,user_id,name,description,tax_type,fixed_amount,currency,is_active,frequency,payment_account_id,auto_pay,next_payment_date,created_at,updated_at)
  VALUES (t_esv,u,'ЄСВ','Unified social contribution','fixed',1760.00,'UAH',true,'monthly',a_mono_black,true,DATE '2026-08-01',now(),now());
  t_pdfo := gen_random_uuid();
  INSERT INTO taxes (id,user_id,name,description,tax_type,currency,percentage,is_active,frequency,payment_account_id,auto_pay,next_payment_date,created_at,updated_at)
  VALUES (t_pdfo,u,'ПДФО з інвестицій (18%)','Personal income tax on investments','percentage','USD',18.0,true,'annually',a_wise_usd,false,DATE '2027-04-30',now(),now());

  INSERT INTO tax_payments (id,tax_id,user_id,amount,currency,payment_date,period_start,period_end,status,created_at,updated_at) VALUES
   (gen_random_uuid(),t_esv,u,1760.00,'UAH',TIMESTAMP '2026-05-20',TIMESTAMP '2026-05-01',TIMESTAMP '2026-05-31','completed',now(),now()),
   (gen_random_uuid(),t_esv,u,1760.00,'UAH',TIMESTAMP '2026-06-20',TIMESTAMP '2026-06-01',TIMESTAMP '2026-06-30','completed',now(),now()),
   (gen_random_uuid(),t_mil,u,180.00,'UAH',TIMESTAMP '2026-06-05',TIMESTAMP '2026-05-01',TIMESTAMP '2026-05-31','completed',now(),now()),
   (gen_random_uuid(),t_mil,u,180.00,'UAH',TIMESTAMP '2026-07-05',TIMESTAMP '2026-06-01',TIMESTAMP '2026-06-30','completed',now(),now()),
   (gen_random_uuid(),t_single,u,2700.00,'UAH',TIMESTAMP '2026-07-05',TIMESTAMP '2026-04-01',TIMESTAMP '2026-06-30','completed',now(),now());

  -------------------------------------------------------------------
  -- 14) BUDGETS (6)
  -------------------------------------------------------------------
  INSERT INTO budgets (id,user_id,name,category,description,amount,currency,period,start_date,is_active,rollover_unused,rollover_amount,alert_threshold,current_period_start,created_at,updated_at)
  SELECT gen_random_uuid(), u, x.nm, x.cat, x.descr, x.amt, x.cur, 'MONTHLY', DATE '2026-07-01', true, false, 0, 80, TIMESTAMP '2026-07-01', now(), now()
  FROM (VALUES
    ('Groceries','groceries','Monthly food budget',15000.00::numeric,'UAH'),
    ('Dining Out','diningOut','Restaurants and cafes',8000.00,'UAH'),
    ('Entertainment','entertainment','Movies, games, events',6000.00,'UAH'),
    ('Transportation','transportation','Taxi, fuel, transit',5000.00,'UAH'),
    ('Shopping and Clothing','clothing','Apparel and shopping',12000.00,'UAH'),
    ('Subscriptions','subscriptions','All recurring services',350.00,'USD')
  ) AS x(nm,cat,descr,amt,cur);

  RAISE NOTICE 'Seed complete for %', u;
END
$seed$;
