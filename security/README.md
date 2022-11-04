


<!-- 

请将证书文件放入此目录，并命名为
mdrproxy-key.pem <br />
mdrproxy-cert.pem
<br />
<br />
<br />

-->

# Toturial

https://www.mrwalkman.com/p/mdrproxyfwsidegradetool.html

<!-- mdrproxy.sh 可以自动生成证书并放入Headphones app中

> 使用前请将所需工具一同放置在此目录内:  
> [uber-apk-signer.jar](./uber-apk-signer)  
> [apktool.jar](./apktool.jar)  
> headphones.apk(unzip [apk.zip](./api.zip))  
> [network_security_config.xml](./network_security_config.xml)

使用方法如下: 

## Linux / Windows
`mdrproxy.sh Headphones.apk`

## Mac
由于 mac 的 OpenSSL 与 sed 机制都与 linux 不同, 故此单独写了一份
```shell
openssl req -newkey ec:<(openssl ecparam -name secp384r1) \
            -x509 \
            -sha256 \
            -days 365 \
            -nodes \
            -utf8 \
            -subj "/C=CN/ST=上海/L=上海/O=上海自来水来自海上/CN=info.update.sony.net" \
            -addext "keyUsage = critical,digitalSignature,keyEncipherment" \
            -addext "extendedKeyUsage = serverAuth, clientAuth" \
            -addext "subjectAltName = DNS:info.update.sony.net" \
            -out mdrproxy_ca.pem \
            -keyout mdrproxy_key.pem && \
sh mac.sh 
```

### Mac Problems
+ `unknown option -addext`  
https://blog.lukaskukacka.com/ios/2020/09/10/ios13-macos1015-generating-self-signed-certificates.html
  + brew install openssl  
  + homebrew-openssl dir: /opt/homebrew/opt/openssl@3/bin/openssl
  + echo 'export PATH="/opt/homebrew/opt/openssl@3/bin:$PATH"' >> ~/.zshrc & source ~/.zshrc   
  
+ mac not support ` sed -i xxx`
  + replace to `sed  -i '' 's/tutorial/example/'   file.txt`




 -->