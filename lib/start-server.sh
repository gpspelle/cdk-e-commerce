#!/bin/bash

cd /home/ec2-user/

## Updating Packages
sudo yum update -y

## Installing Git Client
sudo yum install git -y

## Installing Cronttab
sudo yum install crontabs -y
sudo chkconfig crond on
sudo service crond start

## For system to be able to compile software, you need many development tools, such as make, gcc, and autoconf.
sudo yum groupinstall "Development Tools" -y

## Installing Nginx
sudo amazon-linux-extras install nginx1 -y

## Modifying Nginx Server Configuration
sudo cat > /etc/nginx/nginx.conf <<EOL
user nginx;
worker_processes auto;
include /usr/share/nginx/modules/*.conf;
events {
    worker_connections 1024;
}
http {
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    error_log /dev/null;
    access_log /dev/null;
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    upstream express_server {
        server 127.0.0.1:8000;
        keepalive 64;
    }
    server {
        listen 80 default_server;
        listen [::]:80 default_server;
        server_name _;
        location / {
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header Host \$http_host;
            proxy_set_header Upgrade \$http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_http_version 1.1;
            proxy_pass http://express_server/;
            proxy_redirect off;
            proxy_read_timeout 240s;
        }
    }
}
EOL

## Starting Nginx Services
sudo chkconfig nginx on
sudo service nginx start
sudo service nginx restart

## Writing the Script to be run as ec2-user
cat > /tmp/subscript.sh << EOF

## Installing NVM
curl -sL https://raw.githubusercontent.com/nvm-sh/nvm/v0.34.0/install.sh | bash
 
echo 'export NVM_DIR="/home/ec2-user/.nvm"' >> /home/ec2-user/.bashrc
echo '[ -s "\$NVM_DIR/nvm.sh" ] && . "\$NVM_DIR/nvm.sh"  # This loads nvm' >> /home/ec2-user/.bashrc
 
## Dot source the files to ensure that variables are available within the current shell
. /home/ec2-user/.nvm/nvm.sh
. /home/ec2-user/.bashrc
 
## Install Node.js
nvm install v17.0.1
nvm use v17.0.1
nvm alias default v17.0.1

git clone https://github.com/gpspelle/admin-e-commerce-auth
cd admin-e-commerce-auth

## Installing Global PM2 package
npm install -g pm2

npm install

## Starting the Server
pm2 start index.js

## Saving the current state of pm2
pm2 save

## Adding Cron Job to Auto Restart PM2 on Reboot
cat <(crontab -l) <(echo "@reboot /home/ec2-user/.nvm/versions/node/v17.0.1/bin/node /home/ec2-user/.nvm/versions/node/v17.0.1/bin/pm2 resurrect") | crontab -

EOF

## Changing the owner of the temp script so ec2-user could run it 
chown ec2-user:ec2-user /tmp/subscript.sh && chmod a+x /tmp/subscript.sh

## Executing the script as ec2-user
sleep 1; su - ec2-user -c "/tmp/subscript.sh"