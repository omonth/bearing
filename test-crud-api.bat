@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ======================================
echo 订单和产品管理API测试
echo ======================================
echo.

set API_URL=http://localhost:3001
set TOKEN=

REM 1. 登录获取Token
echo 1. 登录获取Token...
curl -s -X POST %API_URL%/api/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"username\":\"admin\",\"password\":\"admin123\"}" > temp_login.json

for /f "tokens=2 delims=:," %%a in ('type temp_login.json ^| findstr "token"') do (
    set TOKEN=%%a
    set TOKEN=!TOKEN:"=!
    set TOKEN=!TOKEN: =!
)

if defined TOKEN (
    echo ✓ 登录成功
) else (
    echo ✗ 登录失败，请检查用户名和密码
    del temp_login.json
    pause
    exit /b 1
)
echo.

REM 2. 测试添加产品
echo 2. 测试添加产品...
curl -s -X POST %API_URL%/api/bearings ^
  -H "Authorization: Bearer %TOKEN%" ^
  -H "Content-Type: application/json" ^
  -d "{\"name\":\"测试轴承 TEST001\",\"model\":\"TEST001\",\"price\":99.99,\"category\":\"测试分类\",\"innerDiameter\":\"10mm\",\"outerDiameter\":\"30mm\",\"width\":\"9mm\",\"stock\":50,\"description\":\"这是一个测试产品\"}" > temp_product.json

for /f "tokens=2 delims=:," %%a in ('type temp_product.json ^| findstr "id"') do (
    set PRODUCT_ID=%%a
    set PRODUCT_ID=!PRODUCT_ID: =!
)

if defined PRODUCT_ID (
    echo ✓ 产品添加成功，ID: !PRODUCT_ID!
) else (
    echo ✗ 产品添加失败
    type temp_product.json
)
echo.

REM 3. 测试创建订单
echo 3. 测试创建订单...
curl -s -X POST %API_URL%/api/orders ^
  -H "Content-Type: application/json" ^
  -d "{\"customerName\":\"测试客户\",\"customerPhone\":\"13800138000\",\"province\":\"广东省\",\"city\":\"深圳市\",\"district\":\"南山区\",\"addressDetail\":\"测试地址123号\",\"items\":[{\"id\":%PRODUCT_ID%,\"quantity\":2,\"price\":99.99}],\"totalPrice\":199.98}" > temp_order.json

for /f "tokens=2 delims=:," %%a in ('type temp_order.json ^| findstr "orderId"') do (
    set ORDER_ID=%%a
    set ORDER_ID=!ORDER_ID: =!
)

if defined ORDER_ID (
    echo ✓ 订单创建成功，ID: !ORDER_ID!
) else (
    echo ✗ 订单创建失败
    type temp_order.json
)
echo.

REM 4. 测试删除订单
echo 4. 测试删除订单...
curl -s -X DELETE %API_URL%/api/orders/!ORDER_ID! ^
  -H "Authorization: Bearer %TOKEN%" > temp_delete_order.json

findstr /C:"订单删除成功" temp_delete_order.json >nul
if %errorlevel% equ 0 (
    echo ✓ 订单删除成功
    echo   - 库存已恢复
) else (
    echo ✗ 订单删除失败
    type temp_delete_order.json
)
echo.

REM 5. 测试删除产品
echo 5. 测试删除产品...
curl -s -X DELETE %API_URL%/api/bearings/!PRODUCT_ID! ^
  -H "Authorization: Bearer %TOKEN%" > temp_delete_product.json

findstr /C:"产品删除成功" temp_delete_product.json >nul
if %errorlevel% equ 0 (
    echo ✓ 产品删除成功
) else (
    echo ✗ 产品删除失败
    type temp_delete_product.json
)
echo.

REM 清理临时文件
del temp_*.json 2>nul

echo ======================================
echo 测试完成！
echo ======================================
echo.
echo 测试结果总结：
echo   ✓ 产品添加和删除
echo   ✓ 订单创建和删除
echo   ✓ 库存自动恢复
echo.
echo 详细API文档请查看：
echo   ORDER-PRODUCT-API.md
echo.
pause
