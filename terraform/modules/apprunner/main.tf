# --- IAM Role for App Runner ECR Access ---

resource "aws_iam_role" "apprunner_ecr" {
  name = "${var.project_name}-apprunner-ecr-access"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "build.apprunner.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-apprunner-ecr-access"
  }
}

resource "aws_iam_role_policy_attachment" "apprunner_ecr" {
  role       = aws_iam_role.apprunner_ecr.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess"
}

# --- Mock-Services App Runner Service ---

resource "aws_apprunner_service" "mock" {
  service_name = "${var.project_name}-mock"

  source_configuration {
    authentication_configuration {
      access_role_arn = aws_iam_role.apprunner_ecr.arn
    }

    image_repository {
      image_identifier      = "${var.ecr_mock_services_url}:latest"
      image_repository_type = "ECR"

      image_configuration {
        port = "3001"
      }
    }

    auto_deployments_enabled = true
  }

  instance_configuration {
    cpu    = "1024"
    memory = "2048"
  }

  health_check_configuration {
    protocol            = "HTTP"
    path                = "/health"
    healthy_threshold   = 1
    unhealthy_threshold = 5
    interval            = 10
  }

  tags = {
    Name = "${var.project_name}-mock"
  }
}

# Store mock-services URL in SSM for the deploy workflow to read
resource "aws_ssm_parameter" "mock_services_url" {
  name  = "/service-monitor/mock-services-url"
  type  = "String"
  value = "https://${aws_apprunner_service.mock.service_url}"

  tags = {
    Name = "${var.project_name}-mock-url"
  }
}

# --- Web App Runner Service ---

resource "aws_apprunner_service" "web" {
  service_name = "${var.project_name}-web"

  source_configuration {
    authentication_configuration {
      access_role_arn = aws_iam_role.apprunner_ecr.arn
    }

    image_repository {
      image_identifier      = "${var.ecr_web_url}:latest"
      image_repository_type = "ECR"

      image_configuration {
        port = "3000"

        runtime_environment_variables = {
          DATABASE_URL           = var.database_url
          NODE_ENV               = "production"
          POLL_INTERVAL_MS       = "30000"
          CHECK_TIMEOUT_MS       = "3000"
          CONCURRENCY_LIMIT      = "10"
          ALERT_THRESHOLD        = "3"
          RETENTION_DAYS         = "7"
          MAX_CHECKS_PER_SERVICE = "500"
        }
      }
    }

    auto_deployments_enabled = true
  }

  instance_configuration {
    cpu    = "1024"
    memory = "2048"
  }

  health_check_configuration {
    protocol            = "HTTP"
    path                = "/api/monitor/health"
    healthy_threshold   = 1
    unhealthy_threshold = 5
    interval            = 10
  }

  tags = {
    Name = "${var.project_name}-web"
  }

  depends_on = [aws_apprunner_service.mock]
}
