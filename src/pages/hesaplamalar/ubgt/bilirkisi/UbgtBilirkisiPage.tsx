import { useEffect } from "react";
import UbgtCalcPage from "../UbgtCalcPage";

export default function UbgtBilirkisiPage() {
  useEffect(() => {
    document.title = "Bilirkişi UBGT | UBGT Alacağı";
  }, []);

  return <UbgtCalcPage mode="bilirkisi" title="Bilirkişi UBGT Alacağı" backTo="/ubgt" />;
}
