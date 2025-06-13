#!/bin/bash
if [ -z `command -v curl` ] || [ -z `command -v jq` ] || [ -z `command -v wget` ] || [ -z `command -v openssl` ] || [ -z `command -v java` ] || [ -z `command -v zip` ]; then
  echo "请安装 curl, jq, wget, openssl, java, zip"
  echo "please install curl, jq, wget, openssl, java, zip"
  exit 127
fi
# 下载 apktool.jar
# download apktool.jar
if [ ! -f "apktool.jar" ];then
  apktool_url=$(curl 'https://api.github.com/repos/iBotPeaches/Apktool/releases/latest' | jq -r '.assets[] | select(.content_type == "application/java-archive") | .browser_download_url')
  wget $apktool_url -O "apktool.jar"
fi
# 下载 uber-apk-signer.jar
# download uber-apk-signer.jar
if [ ! -f "uber-apk-signer.jar" ];then
  uber_apk_signer_url=$(curl 'https://api.github.com/repos/patrickfav/uber-apk-signer/releases/latest' | jq -r '.assets[] | select(.content_type == "application/java-archive") | .browser_download_url')
  wget $uber_apk_signer_url -O "uber-apk-signer.jar"
fi
# 获取 apk 版本
# get apk version
soundconnect_version=""
# 下载 SoundConnect.apk
# download SoundConnect.apk
if [ ! -f "SoundConnect.apk" ];then
  soundconnect_url=$(curl -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0" https://www.sonystyle.com.cn/minisite/cross/appcenter/pa/sound_connect/index.html | sed "s/\"/\n/g" | grep "/minisite/cross/app/download/")
  soundconnect_version=$(echo $soundconnect_url | awk -Ft_v '{ print $NF }' | sed "s/.apk//")
  wget $soundconnect_url -O SoundConnect.apk
fi
# 生成证书
# generating a certificate
if [ "$1" != "nocert" ];then
  openssl req -x509 -days 365 -config info.update.sony.net.conf -out mdrproxy-cert.pem -keyout mdrproxy-key.pem
fi
# 解包app
# unpacking app
java -jar apktool.jar d --force-all --output SoundConnect --no-src SoundConnect.apk
# 修改app配置
# modifying app configuration
sed 's/android:name="com.sony.songpal.mdr.vim.MdrApplication" /android:name="com.sony.songpal.mdr.vim.MdrApplication" android:networkSecurityConfig="@xml\/network_security_config" /' -i SoundConnect/AndroidManifest.xml
# 添加网络安全配置
# adding network security configuration
cp network_security_config.xml SoundConnect/res/xml/network_security_config.xml
# 添加证书
# adding certificate
cp mdrproxy-cert.pem SoundConnect/res/raw/mdrproxy_ca.pem
# 重新打包
# repacking app
java -jar apktool.jar b --force-all --output SoundConnect_new.apk SoundConnect
# 签名
# signing
java -jar uber-apk-signer.jar -a SoundConnect_new.apk
# 重命名&zip
# rename&zip
if [ -z "$soundconnect_version" ];then
  mv SoundConnect_new-aligned-debugSigned.apk SoundConnect_unknow_unsafe.apk
  zip SoundConnect_unknow_unsafe.zip SoundConnect_unknow_unsafe.apk mdrproxy-key.pem mdrproxy-cert.pem
else
  mv SoundConnect_new-aligned-debugSigned.apk SoundConnect_${soundconnect_version}_unsafe.apk
  zip SoundConnect_${soundconnect_version}_unsafe.zip SoundConnect_${soundconnect_version}_unsafe.apk mdrproxy-key.pem mdrproxy-cert.pem
fi
# 清除临时文件
# clean
rm -f SoundConnect_new-aligned-debugSigned.apk.idsig
rm -f SoundConnect_new.apk
rm -rf SoundConnect
