<?php

$accounts = [
    'admin' => 'Admin@123', 
    'staff' => 'Staff@123', 
];

foreach ($accounts as $role => $plainPassword) {
    $hash = password_hash($plainPassword, PASSWORD_DEFAULT);
    echo strtoupper($role) . ":<br>";
    echo "&nbsp;&nbsp;Plain password: {$plainPassword}<br>";
    echo "&nbsp;&nbsp;Bcrypt hash: {$hash}<br><br>";
}