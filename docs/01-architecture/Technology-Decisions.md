# Technology Decisions

Version: 1.0

---

# Purpose

This document records the approved technology decisions for the School Management System.

It serves as the official reference for the project's technology stack.

Whenever a technology decision changes, this document must be updated.

Detailed reasoning should be recorded in Architecture Decision Records (ADRs).

---

# Decision Principles

Technology choices must:

- Support business requirements.
- Be maintainable.
- Be scalable.
- Have strong community support.
- Be actively maintained.
- Integrate well with the existing architecture.

Avoid choosing technology based on popularity alone.

---

# Web Application

## Technology

React

### Reason

- Component-based architecture
- Mature ecosystem
- Excellent JavaScript ecosystem support
- Strong community adoption

---

## Build Tool

Vite

### Reason

- Fast development server
- Fast builds
- Modern tooling
- Excellent React integration

---

## Language

JavaScript

### Reason

- Simple learning curve
- No build/compile step for source code
- Large ecosystem
- Fast iteration

---

## Styling

Tailwind CSS

### Reason

- Utility-first approach
- Consistent design system
- Minimal custom CSS
- Excellent performance

---

# Mobile Application

## Technology

Flutter

### Reason

- Single codebase
- High performance
- Strong UI capabilities
- Excellent cross-platform support

---

# Backend

## Runtime

Node.js

### Reason

- Non-blocking architecture
- Excellent ecosystem
- Large community
- Good fit for REST APIs

---

## Framework

Express

### Reason

- Lightweight
- Flexible
- Minimal opinionation
- Easy to extend

---

## Language

JavaScript

### Reason

- Shared language with frontend
- Better maintainability
- Consistent tooling across stack

---

# Database

## Database Engine

PostgreSQL

### Reason

- Mature relational database
- Excellent performance
- Strong consistency
- Rich feature set

---

## Deployment

Docker

### Reason

- Consistent local development environment
- Isolated database instance per developer
- Easy setup and teardown
- Matches production deployment approach

---

## ORM

Prisma

### Reason

- Excellent developer experience
- Reliable migrations
- Strong Node.js/JavaScript integration
- Auto-generated query client

---

# Authentication

## Method

JWT

### Reason

- Stateless authentication
- Mobile-friendly
- REST API compatible

### Production Prerequisite

Password-reset and initial-account-setup tokens require a real delivery channel — an approved email or SMS provider — before this feature can be used in production. No such provider is approved or integrated today (see Future Technologies below); until one is, `PASSWORD_RESET_DELIVERY_MODE` (`backend/src/config/password-reset.js`) must be `disabled` in any real deployment, never `development` (which logs the raw token to the console and is explicitly forbidden outside local development, per Security-Standards.md). Selecting `email`/`sms` before a provider is wired up throws rather than silently falling back to logging.

---

# Authorization

## Method

Role-Based Access Control (RBAC)

### Reason

- Simple permission management
- Easy to extend
- Fits business requirements

---

# Architecture

## Style

Modular Monolith

### Reason

- Easier development
- Easier deployment
- Lower operational complexity
- Supports future modularization

---

## Project Structure

Feature-Based Architecture

### Reason

- High cohesion
- Better scalability
- Easier maintenance
- Independent business modules

---

# API Style

REST API

### Reason

- Widely understood
- Easy client integration
- Good tooling support

---

# Version Control

Git

### Branch Strategy

Feature Branch Workflow

---

# Package Manager

npm

### Reason

- Standard Node.js ecosystem
- Reliable dependency management

---

# Testing Strategy

Unit Tests

Integration Tests

End-to-End Tests (Future)

---

# Future Technologies

Potential future additions:

- Redis
- Kubernetes
- RabbitMQ
- Elasticsearch
- S3-compatible object storage
- Push Notifications
- Email/SMS provider (a hard prerequisite for password recovery and initial account setup in production — see Authentication's Production Prerequisite above)

These technologies are not approved until documented and reviewed.

---

# Change Policy

Technology decisions are considered architectural decisions.

Changing an approved technology requires:

- Architectural review
- Impact analysis
- Documentation update
- ADR (if applicable)

Technology should not be changed without a clear business or technical reason.