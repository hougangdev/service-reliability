output "web_url" {
  description = "Web App Runner service URL"
  value       = module.apprunner.web_url
}

output "mock_services_url" {
  description = "Mock-services App Runner service URL"
  value       = module.apprunner.mock_services_url
}

output "db_endpoint" {
  description = "RDS PostgreSQL endpoint"
  value       = module.database.db_endpoint
}
