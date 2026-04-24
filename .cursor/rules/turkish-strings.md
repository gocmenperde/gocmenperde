# Turkish String Quoting Rule (JavaScript)

Türkçe metin string'lerinde tek tırnak kullanırken eklerdeki apostrof (`'`) kolayca syntax hatasına yol açar (`MB'dan`, `URL'den`, `iOS'ta`).

## Kural
- JavaScript string'lerinde Türkçe metin için öncelikle çift tırnak (`"`) kullanın.
- Tek tırnak kullanılacaksa apostrofları `\'` ile escape edin.
- Alternatif olarak template literal (`` ` ``) kullanılabilir.

## Örnekler
- ❌ `alert('iOS'ta hata')`
- ✅ `alert("iOS'ta hata")`
- ✅ `alert('iOS\'ta hata')`
- ✅ ``alert(`iOS'ta hata`)``
