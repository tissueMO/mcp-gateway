FROM node:24-bookworm-slim

# 基本ツールのインストール
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    unzip \
    ca-certificates \
    git \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# AWS CLI v2 のインストール
RUN curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip" \
    && unzip -q awscliv2.zip \
    && ./aws/install \
    && rm -rf aws awscliv2.zip

# AWS SAM CLI のインストール
RUN curl -Lo "aws-sam-cli-linux-x86_64.zip" "https://github.com/aws/aws-sam-cli/releases/latest/download/aws-sam-cli-linux-x86_64.zip" \
    && unzip -q aws-sam-cli-linux-x86_64.zip -d sam-installation \
    && ./sam-installation/install \
    && rm -rf sam-installation aws-sam-cli-linux-x86_64.zip

# esbuild のグローバルインストール (SAM ビルド用)
RUN npm install -g esbuild

WORKDIR /workspace

CMD ["bash"]
