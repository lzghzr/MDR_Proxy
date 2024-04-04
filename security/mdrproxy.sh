if [ -z `command -v curl` ] || [ -z `command -v jq` ] || [ -z `command -v wget` ] || [ -z `command -v openssl` ] || [ -z `command -v java` ]; then
  echo "请安装 curl, jq, wget, openssl, java"
  echo "please install curl, jq, wget, openssl, java"
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
headphones_version=""
# 下载 Headphones.apk
# download Headphones.apk
if [ ! -f "Headphones.apk" ];then
  headphones_url=$(curl https://www.sonystyle.com.cn/minisite/cross/app/headphones_connect.htm | sed "s/'/\n/g" | grep "/minisite/cross/app/download/")
  headphones_version=$(echo $headphones_url | awk -F[_/] '{ print $NF }' | sed "s/.apk//")
  wget $headphones_url -O Headphones.apk
fi
# 生成证书
# generating a certificate
if [ "$1" != "nocert" ];then
  openssl req -x509 -days 365 -config info.update.sony.net.conf -out mdrproxy-cert.pem -keyout mdrproxy-key.pem
fi
# 解包app
# unpacking app
java -jar apktool.jar d --force-all --output Headphones --no-src Headphones.apk
# 修改app配置
# modifying app configuration
sed 's/android:name="com.sony.songpal.mdr.vim.MdrApplication" /android:name="com.sony.songpal.mdr.vim.MdrApplication" android:networkSecurityConfig="@xml\/network_security_config" /' -i Headphones/AndroidManifest.xml
# 添加网络安全配置
# adding network security configuration
cp network_security_config.xml Headphones/res/xml/network_security_config.xml
# 添加证书
# adding certificate
cp mdrproxy-cert.pem Headphones/res/raw/mdrproxy_ca.pem
# 重新打包
# repacking app
java -jar apktool.jar b --force-all --output Headphones_new.apk Headphones
# 签名
# signing
java -jar uber-apk-signer.jar -a Headphones_new.apk
# 重命名
# rename
if [ -z "$headphones_version" ];then
  mv Headphones_new-aligned-debugSigned.apk Headphones_unknow_unsafe.apk
else
  mv Headphones_new-aligned-debugSigned.apk Headphones_${headphones_version}_unsafe.apk
fi
# 清除临时文件
# clean
rm -f Headphones_new-aligned-debugSigned.apk.idsig
rm -f Headphones_new.apk
rm -rf Headphones
