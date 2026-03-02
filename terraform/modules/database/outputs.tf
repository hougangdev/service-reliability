output "database_url" {
  description = "PostgreSQL connection URL"
  value       = "postgresql://postgres:${var.db_password}@${aws_db_instance.main.endpoint}/service_monitor?sslmode=require"
  sensitive   = true
}

output "db_endpoint" {
  description = "RDS endpoint"
  value       = aws_db_instance.main.endpoint
}
