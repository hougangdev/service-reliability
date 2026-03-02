output "web_url" {
  description = "Web App Runner service URL"
  value       = "https://${aws_apprunner_service.web.service_url}"
}

output "mock_services_url" {
  description = "Mock-services App Runner service URL"
  value       = "https://${aws_apprunner_service.mock.service_url}"
}
