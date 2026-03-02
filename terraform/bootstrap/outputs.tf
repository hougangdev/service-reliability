output "state_bucket_name" {
  description = "S3 bucket for Terraform remote state"
  value       = aws_s3_bucket.tfstate.id
}

output "lock_table_name" {
  description = "DynamoDB table for Terraform state locking"
  value       = aws_dynamodb_table.tflock.name
}

output "ecr_web_url" {
  description = "ECR repository URL for the web application"
  value       = aws_ecr_repository.web.repository_url
}

output "ecr_mock_services_url" {
  description = "ECR repository URL for mock services"
  value       = aws_ecr_repository.mock_services.repository_url
}
