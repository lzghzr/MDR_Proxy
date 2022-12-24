请将证书文件放入此目录，并命名为
Please place the certificate file in this directory and name it as follows:

mdrproxy-key.pem <br />
mdrproxy-cert.pem
<br />
<br />
<br />

mdrproxy.sh 可以自动生成证书并放入Headphones app中, 使用方法<br />
The mdrproxy.sh script can automatically generate a certificate and place it in the Headphones app. To use it:<br />
`mdrproxy.sh Headphones.apk`

使用前请将所需工具一同放置在此目录内
Please place the following tools in this directory before using them

apk反编译所需工具
Tools required for apk decompilation

[uber-apk-signer.jar](https://github.com/patrickfav/uber-apk-signer) <br />
[apktool.jar](https://github.com/iBotPeaches/Apktool)