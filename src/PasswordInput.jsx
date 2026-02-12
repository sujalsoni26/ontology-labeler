import { useState } from "react"; 
import { Eye, EyeOff } from "lucide-react"; 

export default function PasswordInput({ 
  id, 
  name, 
  value, 
  onChange, 
  placeholder = "Enter password", 
  required = false, 
  autoComplete = "current-password",
  className = "input-field"
}) { 
  const [showPassword, setShowPassword] = useState(false); 

  return ( 
    <div className="password-input-wrapper" style={{ width: "100%" }}> 
      <input 
        id={id}
        name={name}
        type={showPassword ? "text" : "password"} 
        value={value}
        onChange={onChange}
        placeholder={placeholder} 
        required={required}
        autoComplete={autoComplete}
        className={className}
        style={{ width: "100%", paddingRight: "45px" }} 
      /> 

      <button 
        type="button" 
        className="password-toggle"
        onClick={() => setShowPassword(!showPassword)} 
        title={showPassword ? "Hide password" : "Show password"}
      > 
        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />} 
      </button> 
    </div> 
  ); 
}
