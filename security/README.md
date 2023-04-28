请将证书文件放入此目录，并命名为<br />
>mdrproxy-key.pem<br />
>mdrproxy-cert.pem<br />

Please place the certificate file in this directory and name it as follows:
>mdrproxy-key.pem<br />
>mdrproxy-cert.pem<br />

<br />
<br />
<br />

mdrproxy.sh 可以自动生成证书并放入Headphones app中, 使用方法<br />
`mdrproxy.sh Headphones.apk`<br />
或者不需要自动生成证书<br />
`mdrproxy_nocert.sh Headphones.apk`<br />
The mdrproxy.sh script can automatically generate a certificate and place it in the Headphones app. To use it:<br />
`mdrproxy.sh Headphones.apk`<br />
or do not need to generate a certificate<br />
`mdrproxy_nocert.sh Headphones.apk`<br />

使用前请将所需工具一同放置在此目录内并安装[jdk](https://www.oracle.com/java/technologies/downloads/)<br />
Please place the following tools in this directory and install [jdk](https://www.oracle.com/java/technologies/downloads/) before using them

apk反编译所需工具<br />
>[uber-apk-signer.jar](https://github.com/patrickfav/uber-apk-signer) <br />
>[apktool.jar](https://github.com/iBotPeaches/Apktool)<br />

Tools required for apk decompilation<br />
>[uber-apk-signer.jar](https://github.com/patrickfav/uber-apk-signer) <br />
>[apktool.jar](https://github.com/iBotPeaches/Apktool)
