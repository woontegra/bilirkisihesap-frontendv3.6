import { useEffect } from "react";
import UbgtCalcPage from "../UbgtCalcPage";

export default function UbgtAlacagiPage() {
  useEffect(() => {
    document.title = "Standart UBGT | UBGT Alacağı";
  }, []);

  return <UbgtCalcPage mode="standart" title="Standart UBGT Alacağı" backTo="/ubgt" />;
}
