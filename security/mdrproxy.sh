java -jar apktool.jar d --output Headphones --no-src $1
sed 's/android:name="com.sony.songpal.mdr.vim.MdrApplication" android:roundIcon="@mipmap\/icon_round"/android:name="com.sony.songpal.mdr.vim.MdrApplication" android:networkSecurityConfig="@xml\/network_security_config" android:roundIcon="@mipmap\/icon_round"/' -i Headphones/AndroidManifest.xml
cp network_security_config.xml Headphones/res/xml/network_security_config.xml
cp mdrproxy_ca.pem Headphones/res/raw/mdrproxy_ca.pem
java -jar apktool.jar b --output Headphones_new.apk Headphones
java -jar uber-apk-signer.jar -a Headphones_new.apk
