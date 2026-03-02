module "networking" {
  source = "./modules/networking"

  project_name = var.project_name
  aws_region   = var.aws_region
}

module "database" {
  source = "./modules/database"

  project_name = var.project_name
  vpc_id       = module.networking.vpc_id
  subnet_ids   = module.networking.subnet_ids
  db_password  = var.db_password
}

module "apprunner" {
  source = "./modules/apprunner"

  project_name          = var.project_name
  ecr_web_url           = var.ecr_web_url
  ecr_mock_services_url = var.ecr_mock_services_url
  database_url          = module.database.database_url
  anthropic_api_key     = var.anthropic_api_key
}
