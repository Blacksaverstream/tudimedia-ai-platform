variable "environment" { type = string }
variable "aws_region" { type = string, default = "eu-west-2" }
variable "vpc_cidr" { type = string, default = "10.40.0.0/16" }
variable "media_retention_days" { type = number, default = 365 }
