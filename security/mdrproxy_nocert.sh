# 生成证书
# generating a certificate
# openssl req -x509 -days 365 -config info.update.sony.net.conf -out mdrproxy_ca.pem -keyout mdrproxy_key.pem
# cp mdrproxy_ca.pem mdrproxy-cert.pem
# cp mdrproxy_key.pem mdrproxy-key.pem
# 解包app
# unpacking app
java -jar apktool.jar d --output Headphones --no-src $1
# 修改app配置
# modifying app configuration
sed 's/android:name="com.sony.songpal.mdr.vim.MdrApplication" android:roundIcon="@mipmap\/icon_round"/android:name="com.sony.songpal.mdr.vim.MdrApplication" android:networkSecurityConfig="@xml\/network_security_config" android:roundIcon="@mipmap\/icon_round"/' -i Headphones/AndroidManifest.xml
# 添加网络安全配置
# adding network security configuration
cp network_security_config.xml Headphones/res/xml/network_security_config.xml
# 添加证书
# adding certificate
cp mdrproxy_ca.pem Headphones/res/raw/mdrproxy_ca.pem
# 重新打包
# repacking app
java -jar apktool.jar b --output Headphones_new.apk Headphones
# 签名
# signing
java -jar uber-apk-signer.jar -a Headphones_new.apk
