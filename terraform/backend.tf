# Update "bucket" with the actual name from: cd bootstrap && terraform output state_bucket_name
terraform {
  backend "s3" {
    bucket         = "service-monitor-tfstate-8b0488af"
    key            = "terraform.tfstate"
    region         = "ap-southeast-1"
    dynamodb_table = "service-monitor-tflock"
    encrypt        = true
  }
}
