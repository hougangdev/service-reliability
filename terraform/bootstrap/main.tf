terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# -------------------------------------------------------
# Random suffix for globally-unique S3 bucket name
# -------------------------------------------------------
resource "random_id" "suffix" {
  byte_length = 4
}

# -------------------------------------------------------
# S3 bucket – remote state storage
# -------------------------------------------------------
resource "aws_s3_bucket" "tfstate" {
  bucket        = "service-monitor-tfstate-${random_id.suffix.hex}"
  force_destroy = false

  tags = {
    Name        = "service-monitor-tfstate-${random_id.suffix.hex}"
    Environment = "shared"
  }
}

resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# -------------------------------------------------------
# DynamoDB table – state locking
# -------------------------------------------------------
resource "aws_dynamodb_table" "tflock" {
  name         = "service-monitor-tflock"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  tags = {
    Name        = "service-monitor-tflock"
    Environment = "shared"
  }
}

# -------------------------------------------------------
# ECR repository – web application
# -------------------------------------------------------
resource "aws_ecr_repository" "web" {
  name                 = "service-monitor/web"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Name        = "service-monitor/web"
    Environment = "shared"
  }
}

resource "aws_ecr_lifecycle_policy" "web" {
  repository = aws_ecr_repository.web.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 10 untagged images"
        selection = {
          tagStatus   = "untagged"
          countType   = "imageCountMoreThan"
          countNumber = 10
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

# -------------------------------------------------------
# ECR repository – mock services
# -------------------------------------------------------
resource "aws_ecr_repository" "mock_services" {
  name                 = "service-monitor/mock-services"
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Name        = "service-monitor/mock-services"
    Environment = "shared"
  }
}

resource "aws_ecr_lifecycle_policy" "mock_services" {
  repository = aws_ecr_repository.mock_services.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 10 untagged images"
        selection = {
          tagStatus   = "untagged"
          countType   = "imageCountMoreThan"
          countNumber = 10
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}
