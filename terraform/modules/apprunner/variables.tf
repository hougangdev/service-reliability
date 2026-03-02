variable "project_name" {
  description = "Project name for resource tagging"
  type        = string
}

variable "ecr_web_url" {
  description = "ECR repository URL for web image"
  type        = string
}

variable "ecr_mock_services_url" {
  description = "ECR repository URL for mock-services image"
  type        = string
}

variable "database_url" {
  description = "PostgreSQL connection URL"
  type        = string
  sensitive   = true
}
