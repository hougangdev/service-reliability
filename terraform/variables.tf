variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-southeast-1"
}

variable "project_name" {
  description = "Project name used for resource naming and tagging"
  type        = string
  default     = "service-monitor"
}

variable "db_password" {
  description = "RDS master password"
  type        = string
  sensitive   = true
}

variable "ecr_web_url" {
  description = "ECR repository URL for the web image"
  type        = string
}

variable "ecr_mock_services_url" {
  description = "ECR repository URL for the mock-services image"
  type        = string
}

variable "anthropic_api_key" {
  description = "Anthropic API key for AI incident summaries"
  type        = string
  sensitive   = true
  default     = ""
}
